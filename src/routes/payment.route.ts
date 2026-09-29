import {Router} from "express";
import {z} from "zod";
import {client} from "@eve_health/db";
import {AppError,isDuplicate}from "../lib/error";
import {requireAuth}from "../lib/auth";
import {validate}from "../middlewares/validate";

export const paymentroute = Router();

export const makePayment = z.object({
    bookingId:z.string().min(1),
    force:z.enum(["SUCCESS","FAILED"]).optional(),
});

export const paymentWebhook = z.object({
    eventId:z.string().min(1),
    bookingId:z.string().min(1),
    status:z.enum(["SUCCESS","FAILED"]),
});

paymentroute.post("/",requireAuth,validate(makePayment),async (req,res)=>{
    const {bookingId,force} = req.body;
    const booking = await client.orm.public.Booking.where({id:bookingId}).first();
    if(!booking){
        throw new AppError(404,"NotFound","Invalid booking id");
    }
    if(booking.userId!==req.userId){
        throw new AppError(403,"Forbidden","Not your booking");
    }
    if(booking.status!=="PENDING"){
        throw new AppError(409,"Conflict","Booking already paid or cancelled");
    }
    const existing = await client.orm.public.Payment.where({bookingId}).first();
    if(existing){
        throw new AppError(409,"Conflict","Booking already paid");
    }
    const outcome = force || (Math.random()<0.5 ? "SUCCESS" : "FAILED");
    const providerRef = "pay_" + Date.now() + "_" + Math.floor(Math.random()*1000000);
    try{
        const result = await client.transaction(async (tx)=>{
            const payment = await tx.orm.public.Payment.create({bookingId,status:outcome,providerRef});
            const updated = await tx.orm.public.Booking.where({id:bookingId}).update({status:outcome==="SUCCESS" ? "CONFIRMED" : "FAILED"});
            return {payment,booking:updated};
        });
        res.status(201).json(result);
    }
    catch(e){
        if(isDuplicate(e)){
            throw new AppError(409,"Conflict","Booking already paid");
        }
        throw e;
    }
});


paymentroute.post("/webhook",validate(paymentWebhook),async (req,res)=>{
    const {eventId,bookingId,status} = req.body;
    const seen = await client.orm.public.Payment.where({providerRef:eventId}).first();
    if(seen){
        return res.status(200).json({ok:true,deduped:true,payment:seen});
    }
    const booking = await client.orm.public.Booking.where({id:bookingId}).first();
    if(!booking){
        throw new AppError(404,"NotFound","Invalid booking id");
    }
    try{
        const result = await client.transaction(async (tx)=>{
            const again = await tx.orm.public.Payment.where({providerRef:eventId}).first();
            if(again){
                return {payment:again,alreadyPaid:true};
            }
            const current = await tx.orm.public.Booking.where({id:bookingId}).first();
            if(!current || current.status!=="PENDING"){
                const existing = await tx.orm.public.Payment.where({bookingId}).first();
                if(existing){
                    return {payment:existing,alreadyPaid:true};
                }
                throw new AppError(409,"Conflict","Booking already paid or cancelled");
            }
            const created = await tx.orm.public.Payment.create({bookingId,status,providerRef:eventId});
            await tx.orm.public.Booking.where({id:bookingId}).update({status:status==="SUCCESS" ? "CONFIRMED" : "FAILED"});
            return {payment:created,alreadyPaid:false};
        });
        const fresh = await client.orm.public.Booking.where({id:bookingId}).first();
        res.status(200).json({ok:true,deduped:result.alreadyPaid,payment:result.payment,booking:fresh});
    }
    catch(e){
        if(e instanceof AppError){
            throw e;
        }
        if(isDuplicate(e)){
            const dupe = await client.orm.public.Payment.where({providerRef:eventId}).first();
            if(dupe){
                return res.status(200).json({ok:true,deduped:true,payment:dupe});
            }
            const current = await client.orm.public.Payment.where({bookingId}).first();
            return res.status(200).json({ok:true,deduped:true,payment:current});
        }
        throw e;
    }
});
