import type{Request,Response,NextFunction} from "express";
import {AppError} from "./error";
import {verifyToken} from "./jwt";

declare global{
    namespace Express{
        interface Request{
            userId?:string;
        }
    }
}

export function requireAuth (req:Request,res:Response,next:NextFunction){
    const header = req.headers.authorization;
    if(!header?.startsWith("Bearer ")){
        throw new AppError(401,"UnauthorizedError","No authorization header");
    }

    try{
        req.userId = verifyToken(header.slice(7)).sub 
        next();
    }
    catch(e){
        throw new AppError(401,"UnauthorizedError","Invalid token");
    }

}