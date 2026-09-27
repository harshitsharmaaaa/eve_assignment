import {client} from "@eve_health/db";


const user = await client.orm.public.User.create({
    email: "enzo@eve.com",
    passwordHash: "test",
});

console.log(user);