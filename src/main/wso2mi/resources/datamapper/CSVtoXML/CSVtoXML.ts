import * as dmUtils from "./dm-utils";
declare var DM_PROPERTIES: any;

/*
* title : "root",
* inputType : "CSV",
*/
interface Root {
    id: string
    first_name: string
    last_name: string
    email: string
    department: string
    salary: string
    hire_date: string
    active: string
}

/*
* title : "employees",
* outputType : "XML",
*/
interface Employees {
    employee: {
        id: string
        first_name: string
        last_name: string
        department: string
        salary: string
    }[]
}



/**
 * functionName : map_S_root_S_employees
 * inputVariable : inputroot
*/
export function mapFunction(input: Root[]): Employees {
    return mapRootArrayToEmployees(input)
}

function mapRootArrayToEmployees(input: Root[]): Employees {
    return {
        employee: input
            .filter(row => row.id !== "id")
            .map(row => ({
                id: row.id,
                first_name: row.first_name,
                last_name: row.last_name,
                department: row.department,
                salary: row.salary
            }))
    }
};

