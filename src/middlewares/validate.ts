import type{Request,Response,NextFunction} from "express";
import type{ZodSchema} from "zod";
import {AppError} from "../lib/error";

export const validate = (schema:ZodSchema)=>(req:Request,res:Response,next:NextFunction)=>{
    const parsed = schema.safeParse(req.body);
    if(parsed.success){
        req.body = parsed.data;
        next();
    }
    else{
        throw new AppError(400,"ValidationError","Invalid request body",parsed.error.flatten());
    }
}