import {Router} from "express";
import z from "zod";
import {client} from "@eve_health/db";
import bcrypt from "bcryptjs";
import {validate} from "../middlewares/validate";
import {signToken} from "../lib/jwt";
import {AppError,isDuplicate}from "../lib/error";

export const authroute = Router();

export const credentials =z.object({
    email:z.string().email().transform(val=>val.toLowerCase()),
    password:z.string().min(8)
})


authroute.post("/signup",validate(credentials),async (req,res)=>{
    const {email,password} = req.body;
    const alreadyExists = await client.orm.public.User.first({email});
    if(alreadyExists){
        throw new AppError(409,"Conflict","User already exists");
    }
    try{
        const user = await client.orm.public.User.create({email,passwordHash:await bcrypt.hash(password,10)});
        res.status(201).json({id:user.id,email:user.email,token:signToken(user)});
    }
    catch(e){
        if(isDuplicate(e)){
            throw new AppError(409,"Conflict","User already exists");
        }
        throw e;
    }
});

authroute.post("/login",validate(credentials),async (req,res)=>{
    const {email,password} = req.body;
    const user = await client.orm.public.User.first({email});
    if(!user){
        throw new AppError(401,"UnauthorizedError","Invalid email or password");
    }
    const isValid = await bcrypt.compare(password,user.passwordHash);
    if(!isValid){
        throw new AppError(401,"UnauthorizedError","Invalid email or password");
    }
    res.status(200).json({id:user.id,email:user.email,token:signToken(user)});
});

