export class AppError extends Error{
    constructor(
        public status:number,
        public code:string,
        message:string,
        detail?:unknown
    ){
        super(message);
    }
}

export const NotFoundError =(msg:string)=> new AppError(404,"NotFound",msg);
export const UnauthorizedError =(msg:string)=> new AppError(401,"Unauthorized",msg);
export const BadRequestError =(msg:string)=> new AppError(400,"BadRequest",msg);
export const ValidationError =(msg:string)=> new AppError(400,"ValidationError",msg);
export const ForbiddenError =(msg:string)=> new AppError(403,"Forbidden",msg);
export const ConflictError =(msg:string)=> new AppError(409,"Conflict",msg);

export function isDuplicate(e:any){
    const msg = String(e?.message || "");
    return msg.includes("duplicate key") || msg.includes("unique constraint") || msg.includes("UNIQUE");
}
