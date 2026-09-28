import {client} from "@eve_health/db";

const centres = [
    {
        name:"City Diagnostics",
        location:"MG Road",
        tests:[
            {name:"CBC",price:"299.00"},
            {name:"Lipid Profile",price:"799.00"},
        ],
    },
    {
        name:"Apollo Labs",
        location:"Indiranagar",
        tests:[
            {name:"Thyroid TSH",price:"499.00"},
            {name:"HbA1c",price:"399.00"},
        ],
    },
];

const existing = await client.orm.public.DiagnosticCentre.all();
if(existing.length>0){
    console.log("Already seeded, skipping");
}
else{
    for(const c of centres){
        const created = await client.orm.public.DiagnosticCentre.create({name:c.name,location:c.location});
        for(const t of c.tests){
            await client.orm.public.DiagnosticTest.create({name:t.name,price:t.price,centreId:created.id});
        }
        console.log("Seeded " + c.name);
    }
}
await client.close();
