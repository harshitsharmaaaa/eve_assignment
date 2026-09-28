import {Router} from "express";
import {z} from "zod";
import {client} from "@eve_health/db";
import {AppError} from "../lib/error";
import {validate} from "../middlewares/validate";
export const centeroute = Router();

export const createCenter = z.object({
    name:z.string().min(1),
    location:z.string().min(1),
})
export const createTest = z.object({
    name:z.string().min(1),
    price:z.number().positive().multipleOf(0.01),
})

centeroute.post("/",validate(createCenter),async (req,res)=>{
    const {name,location} = req.body;
    const center = await client.orm.public.DiagnosticCentre.create({name,location});
    res.status(201).json(center);
});

centeroute.get("/",async (req,res)=>{
    const centers = await client.orm.public.DiagnosticCentre.all();
    const out = [];
    for(const c of centers){
        const tests = await client.orm.public.DiagnosticTest.where({centreId:c.id}).all();
        out.push({...c,tests});
    }
    res.status(200).json(out);
});

centeroute.get("/:id",async (req,res)=>{
    const id = String(req.params.id);
    const center = await client.orm.public.DiagnosticCentre.where({id}).first();
    if(!center){
        throw new AppError(404,"NotFound","Invalid centre id");
    }
    const tests = await client.orm.public.DiagnosticTest.where({centreId:id}).all();
    res.status(200).json({...center,tests});
});

centeroute.post("/:id/tests",validate(createTest),async (req,res)=>{
    const id = String(req.params.id);
    const center = await client.orm.public.DiagnosticCentre.where({id}).first();
    if(!center){
        throw new AppError(404,"NotFound","Invalid centre id");
    }
    const {name,price} = req.body;
    const test = await client.orm.public.DiagnosticTest.create({name,price:price.toFixed(2),centreId:id});
    res.status(201).json(test);
});
