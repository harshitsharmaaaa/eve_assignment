import {Temporal} from "temporal-polyfill";
import {z} from "zod";
import {Router} from "express";
import {validate} from "../middlewares/validate";
import {AppError} from "../lib/error";
import {requireAuth} from "../lib/auth";
import {client} from "@eve_health/db";

export const bookTest = z.object({
    testId:z.string().min(1),
    appointmentAt:z.string().datetime().refine(val=>new Date(val).getTime()>Date.now(),"Appointment time must be in the future"),
})

export const bookingroute = Router();
bookingroute.use(requireAuth);

async function withCentre(booking:any){
    const test = await client.orm.public.DiagnosticTest.where({id:booking.testId}).first();
    if(!test){
        return {...booking,test:null,centre:null};
    }
    const centre = await client.orm.public.DiagnosticCentre.where({id:test.centreId}).first();
    return {...booking,test,centre};
}

bookingroute.post("/book",validate(bookTest),async (req,res)=>{
    const {testId,appointmentAt} = req.body;
    const test = await client.orm.public.DiagnosticTest.where({id:testId}).first();

    if(!test){
        throw new AppError(404,"NotFound","Invalid test id");
    }

    const booking = await client.orm.public.Booking.create({
        userId:req.userId,
        testId,
        appointmentAt:Temporal.Instant.from(appointmentAt),
        amount:test.price,
    });
    const out = await withCentre(booking);
    res.status(201).json(out);
});

bookingroute.get("/",async (req,res)=>{
    const bookings = await client.orm.public.Booking.where({userId:req.userId}).all();
    const out = [];
    for(const b of bookings){
        out.push(await withCentre(b));
    }
    res.status(200).json(out);
});

bookingroute.get("/:id",async (req,res)=>{
    const booking = await client.orm.public.Booking.where({id:String(req.params.id)}).first();
    if(!booking){
        throw new AppError(404,"NotFound","Invalid booking id");
    }
    if(booking.userId!==req.userId){
        throw new AppError(403,"Forbidden","Not your booking");
    }
    res.status(200).json(await withCentre(booking));
});

bookingroute.post("/:id/cancel",async (req,res)=>{
    const booking = await client.orm.public.Booking.where({id:String(req.params.id)}).first();
    if(!booking){
        throw new AppError(404,"NotFound","Invalid booking id");
    }
    if(booking.userId!==req.userId){
        throw new AppError(403,"Forbidden","Not your booking");
    }
    if(booking.status!=="PENDING"){
        throw new AppError(409,"Conflict","Only pending bookings can be cancelled");
    }
    const updated = await client.orm.public.Booking.where({id:booking.id}).update({status:"CANCELLED"});
    res.status(200).json(await withCentre(updated));
});
