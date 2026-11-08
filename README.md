# csv2xml

A WSO2 Micro Integrator 4.6.0 project that watches a directory for employee CSV
files, converts them to XML, validates the XML against `employee.xsd`, writes the
result, archives the source file, and records the outcome in PostgreSQL.

## How it works

1. A VFS inbound endpoint polls `WATCH_DIR` every 5 seconds and processes one file at a time.
2. The `CSVtoXML` DataMapper converts the CSV to XML.
3. The XML is validated against `employee.xsd`.
4. On success: XML is written to `DONE_DIR`, the CSV is moved to `BACKUP_DIR`, and a row with `success = TRUE` is inserted.
5. On failure: the CSV is moved to `ERROR_DIR` and a row with `success = FALSE` is inserted.

## Requirements

- WSO2 Micro Integrator 4.6.0
- JDK 21 or 25
- Maven 3.9.x
- PostgreSQL
- Docker (optional, for the image and the development database)

The PostgreSQL JDBC driver must be in `<MI_HOME>/lib/`. The repository has
`deployment/libs/postgresql-42.7.14.jar` locally, but `*.jar` is gitignored, so a
fresh clone does not include it.

## Quick start

### 1. Create the database table

The integration does not create the table automatically.

```sql
CREATE TABLE file_transactions (
    id           BIGSERIAL PRIMARY KEY,
    file_path    TEXT NOT NULL,
    success      BOOLEAN NOT NULL,
    error_reason TEXT,
    csv_data     TEXT,
    result_xml   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Each processed file inserts one row using `file_path`, `success`, `error_reason`,
`csv_data`, and `result_xml`. `id` and `created_at` are filled by defaults.

### 2. Set the environment

```bash
cp .env.example .env
```

```dotenv
WATCH_DIR=/absolute/path/CSVs
DONE_DIR=/absolute/path/Done
BACKUP_DIR=/absolute/path/Backup
ERROR_DIR=/absolute/path/Error

DB_URL=jdbc:postgresql://localhost:5432/demo
DB_USER=postgres
DB_PASSWORD=secret
```

The four directories must already exist. `DB_HOST_NAME` is present in
`.env.example` but is not used by the integration.

### 3. Build and run locally

```bash
# Build the Carbon Application
mvn clean package

# Deploy it
cp target/csv2xml_1.0.0.car <MI_HOME>/repository/deployment/server/carbonapps/

# Make the JDBC driver available
cp deployment/libs/postgresql-42.7.14.jar <MI_HOME>/lib/

# Add the [[datasource]] block from deployment/deployment.toml
# to <MI_HOME>/conf/deployment.toml, then start MI
<MI_HOME>/bin/micro-integrator.sh --env-file="$PWD/.env"
```

Drop a CSV into `WATCH_DIR` to test it.

### 4. Build and run with Docker

```bash
# Optional: start the development PostgreSQL and pgAdmin
docker compose -f DB_Docker/compose.yml up -d

# Build the image (requires postgresql-42.7.14.jar in deployment/libs/)
mvn clean package -Pdocker

# Runtime environment
cat > .env.docker <<'EOF'
DB_URL=jdbc:postgresql://host.docker.internal:5432/demo
DB_USER=postgres
DB_PASSWORD=secret
WATCH_DIR=/data/CSVs
DONE_DIR=/data/Done
BACKUP_DIR=/data/Backup
ERROR_DIR=/data/Error
EOF

mkdir -p data/CSVs data/Done data/Backup data/Error

docker run -d --rm --name csv2xml \
  --env-file .env.docker \
  -v "$PWD/data:/data" \
  --add-host=host.docker.internal:host-gateway \
  csv2xml:1.0.0
```

The `--add-host` flag is needed on Linux. The `postgres` / `secret` credentials are
development defaults from `DB_Docker/compose.yml`.

If Docker reports file permission issues, check the permissions and ownership of
the `data/` directory.

## CSV format

The file must start with a header whose first column is `id`, followed by one or
more data rows.

**Column order matters.** The DataMapper reader maps columns by position, not by
header name, so reordering columns puts values in the wrong fields.

| Column | Value |
|---|---|
| `id` | Positive integer |
| `first_name` | Non-empty string, 1–100 characters |
| `last_name` | Non-empty string, 1–100 characters |
| `email` | Address containing `@` and a dot in the domain, max 254 characters |
| `department` | Non-empty string, 1–100 characters |
| `salary` | Decimal, 0 or greater, at most 2 fraction digits |
| `hire_date` | `YYYY-MM-DD` |
| `active` | `TRUE`/`FALSE` or `true`/`false` |

The header row is skipped because its first value is literally `id`. The `active`
value is trimmed and lowercased.

### Example input

```csv
id,first_name,last_name,email,department,salary,hire_date,active
1,Jane,Doe,jane.doe@example.com,Engineering,75000.00,2023-04-01,TRUE
2,John,Smith,john.smith@example.com,Sales,65000.00,2022-09-15,FALSE
```

### Example output

```xml
<employees>
  <employee>
    <id>1</id>
    <first_name>Jane</first_name>
    <last_name>Doe</last_name>
    <email>jane.doe@example.com</email>
    <department>Engineering</department>
    <salary>75000.00</salary>
    <hire_date>2023-04-01</hire_date>
    <active>true</active>
  </employee>
  <employee>
    <id>2</id>
    <first_name>John</first_name>
    <last_name>Smith</last_name>
    <email>john.smith@example.com</email>
    <department>Sales</department>
    <salary>65000.00</salary>
    <hire_date>2022-09-15</hire_date>
    <active>false</active>
  </employee>
</employees>
```

For an input named `employees.csv`, the XML is written as `DONE_DIR/employees.xml`.
Use lowercase `.csv`; the output name is derived by replacing that suffix.

## Notes

- File moves and the database insert are not atomic. A failure between them can leave a file archived without a matching audit row.
- Failed files are only moved to `ERROR_DIR`; there is no retry. The error path builds a `_failed.xml` name but does not write that file.
- The inbound endpoint has no filename filter, so every regular file placed in `WATCH_DIR` is treated as CSV input.
- The CSV schema is fixed. Adding a column requires updating both `CSVtoXML.ts` and `employee.xsd`.
- Flow logs use `category="DEBUG"`. Enable DEBUG logging for the flow if you need to see them.
- The SQL uses PostgreSQL-specific casts (`::text`), so the database must be PostgreSQL.
- There are no automated tests under `src/test`.
