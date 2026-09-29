import {describe,test,expect,beforeAll,afterAll} from "bun:test";
import {app} from "../src/server";
import {client} from "@eve_health/db";

let base = "";
let server:any;
const created = {users:[] as string[],bookings:[] as string[],tests:[] as string[],centres:[] as string[],payments:[] as string[]};

function mail(){
    return "t" + Date.now() + Math.floor(Math.random()*100000) + "@x.com";
}

async function signup(email:string){
    const res = await fetch(base + "/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password:"password123"})});
    const body = await res.json() as any;
    created.users.push(body.id);
    return body;
}

async function setupBooking(token:string){
    const c = await (await fetch(base + "/centers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Test Centre",location:"Here"})})).json() as any;
    created.centres.push(c.id);
    const t = await (await fetch(base + "/centers/" + c.id + "/tests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"CBC",price:99.5})})).json() as any;
    created.tests.push(t.id);
    const future = new Date(Date.now() + 86400000).toISOString();
    const b = await (await fetch(base + "/bookings/book",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer " + token},body:JSON.stringify({testId:t.id,appointmentAt:future})})).json() as any;
    created.bookings.push(b.id);
    return {centre:c,test:t,booking:b};
}

beforeAll(()=>{
    return new Promise<void>((done)=>{
        server = app.listen(0,()=>{
            const addr = server.address();
            base = "http://localhost:" + addr.port;
            done();
        });
    });
});

afterAll(async ()=>{
    server.close();
    for(const id of created.payments){
        try{ await client.orm.public.Payment.where({id}).delete(); }catch{}
    }
    for(const id of created.bookings){
        try{ await client.orm.public.Booking.where({id}).delete(); }catch{}
    }
    for(const id of created.tests){
        try{ await client.orm.public.DiagnosticTest.where({id}).delete(); }catch{}
    }
    for(const id of created.centres){
        try{ await client.orm.public.DiagnosticCentre.where({id}).delete(); }catch{}
    }
    for(const id of created.users){
        try{ await client.orm.public.User.where({id}).delete(); }catch{}
    }
    await client.close();
});

describe("auth",()=>{
    test("signup and login work",async ()=>{
        const email = mail();
        const res = await fetch(base + "/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password:"password123"})});
        expect(res.status).toBe(201);
        const body = await res.json() as any;
        created.users.push(body.id);
        expect(body.token).toBeTruthy();

        const login = await fetch(base + "/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password:"password123"})});
        expect(login.status).toBe(200);
        expect(((await login.json()) as any).token).toBeTruthy();
    });

    test("bad signup body is 400",async ()=>{
        const res = await fetch(base + "/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"not-an-email",password:"short"})});
        expect(res.status).toBe(400);
    });

    test("protected routes reject missing and bad tokens",async ()=>{
        const none = await fetch(base + "/bookings");
        expect(none.status).toBe(401);
        const bad = await fetch(base + "/bookings",{headers:{Authorization:"Bearer garbage"}});
        expect(bad.status).toBe(401);
    });
});

describe("bookings",()=>{
    test("booking a missing test is 404",async ()=>{
        const u = await signup(mail());
        const future = new Date(Date.now() + 86400000).toISOString();
        const res = await fetch(base + "/bookings/book",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer " + u.token},body:JSON.stringify({testId:"no-such-id",appointmentAt:future})});
        expect(res.status).toBe(404);
    });

    test("another user cannot read or cancel my booking",async ()=>{
        const a = await signup(mail());
        const b = await signup(mail());
        const {booking} = await setupBooking(a.token);
        const read = await fetch(base + "/bookings/" + booking.id,{headers:{Authorization:"Bearer " + b.token}});
        expect(read.status).toBe(403);
        const cancel = await fetch(base + "/bookings/" + booking.id + "/cancel",{method:"POST",headers:{Authorization:"Bearer " + b.token}});
        expect(cancel.status).toBe(403);
        const mine = await fetch(base + "/bookings/" + booking.id,{headers:{Authorization:"Bearer " + a.token}});
        expect(mine.status).toBe(200);
    });

    test("unknown booking id is 404",async ()=>{
        const u = await signup(mail());
        const res = await fetch(base + "/bookings/no-such-id",{headers:{Authorization:"Bearer " + u.token}});
        expect(res.status).toBe(404);
    });
});

describe("payments",()=>{
    test("paying twice is 409",async ()=>{
        const u = await signup(mail());
        const {booking} = await setupBooking(u.token);
        const first = await fetch(base + "/payments",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer " + u.token},body:JSON.stringify({bookingId:booking.id,force:"SUCCESS"})});
        expect(first.status).toBe(201);
        created.payments.push(((await first.json()) as any).payment.id);
        const second = await fetch(base + "/payments",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer " + u.token},body:JSON.stringify({bookingId:booking.id,force:"SUCCESS"})});
        expect(second.status).toBe(409);
    });

    test("paying a cancelled booking is 409",async ()=>{
        const u = await signup(mail());
        const {booking} = await setupBooking(u.token);
        await fetch(base + "/bookings/" + booking.id + "/cancel",{method:"POST",headers:{Authorization:"Bearer " + u.token}});
        const res = await fetch(base + "/payments",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer " + u.token},body:JSON.stringify({bookingId:booking.id,force:"SUCCESS"})});
        expect(res.status).toBe(409);
    });
});

describe("webhook",()=>{
    test("same event twice applies once",async ()=>{
        const u = await signup(mail());
        const {booking} = await setupBooking(u.token);
        const eventId = "evt_" + Date.now() + "_replay";
        const payload = {eventId,bookingId:booking.id,status:"SUCCESS"};
        const one = await fetch(base + "/payments/webhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        expect(one.status).toBe(200);
        created.payments.push(((await one.json()) as any).payment.id);
        const two = await fetch(base + "/payments/webhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        expect(two.status).toBe(200);
        expect(((await two.json()) as any).deduped).toBe(true);
        const rows = await client.orm.public.Payment.where({bookingId:booking.id}).all();
        expect(rows.length).toBe(1);
        const fresh = await client.orm.public.Booking.where({id:booking.id}).first();
        expect(fresh!.status).toBe("CONFIRMED");
    });

    test("ten concurrent duplicate webhooks still apply once",async ()=>{
        const u = await signup(mail());
        const {booking} = await setupBooking(u.token);
        const eventId = "evt_" + Date.now() + "_race";
        const payload = {eventId,bookingId:booking.id,status:"SUCCESS"};
        const calls = [];
        for(let i = 0;i < 10;i++){
            calls.push(fetch(base + "/payments/webhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}));
        }
        const results = await Promise.all(calls);
        for(const r of results){
            expect(r.status).toBe(200);
        }
        const rows = await client.orm.public.Payment.where({bookingId:booking.id}).all();
        expect(rows.length).toBe(1);
        created.payments.push(rows[0]!.id);
        const fresh = await client.orm.public.Booking.where({id:booking.id}).first();
        expect(fresh!.status).toBe("CONFIRMED");
    });

    test("webhook for a cancelled booking creates no payment",async ()=>{
        const u = await signup(mail());
        const {booking} = await setupBooking(u.token);
        const cancelled = await fetch(base + "/bookings/" + booking.id + "/cancel",{method:"POST",headers:{Authorization:"Bearer " + u.token}});
        expect(cancelled.status).toBe(200);
        const eventId = "evt_" + Date.now() + "_cancelled";
        const payload = {eventId,bookingId:booking.id,status:"SUCCESS"};
        const res = await fetch(base + "/payments/webhook",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        expect(res.status).toBe(409);
        const rows = await client.orm.public.Payment.where({bookingId:booking.id}).all();
        expect(rows.length).toBe(0);
        const fresh = await client.orm.public.Booking.where({id:booking.id}).first();
        expect(fresh!.status).toBe("CANCELLED");
    });
});
