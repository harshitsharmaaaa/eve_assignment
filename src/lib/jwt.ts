import jwt from "jsonwebtoken";
export const signToken = (user:any)=>{
    return jwt.sign({sub:user.id},process.env.JWT_SECRET!,{expiresIn:process.env.JWT_EXPIRY as jwt.SignOptions["expiresIn"]});
}

export const verifyToken = (token:string)=>{
    return jwt.verify(token,process.env.JWT_SECRET!) as {sub:string};
}
