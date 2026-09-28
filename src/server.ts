import express from "express";
import type{Request,Response,NextFunction} from "express";
import {authroute} from "./routes/auth.routes";
import {centeroute} from "./routes/center.route"
import {bookingroute} from "./routes/booking.route";
import {paymentroute} from "./routes/payment.route";
import {openapi} from "./lib/docs";
import swaggerUi from "swagger-ui-express";
import helmet from "helmet";
import {AppError} from "./lib/error";

export const app = express();
app.use(helmet());
app.use(express.json({limit:"100kb"}));

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.use("/health",async(req,res)=> res.json({message:"Healthy"}));
app.use("/docs",swaggerUi.serve,swaggerUi.setup(openapi));
app.get("/openapi.json",(req,res)=> res.json(openapi));
app.use("/auth",authroute);
app.use("/centers",centeroute);
app.use("/bookings",bookingroute);
app.use("/payments",paymentroute);

app.use((req,res)=>{
    res.status(404).json({message:"Not found"});
});

app.use((err:any,req:Request,res:Response,next:NextFunction)=>{
    if(err instanceof AppError){
        return res.status(err.status).json({message:err.message,code:err.code});
    }
    if(err?.type==="entity.parse.failed"){
        return res.status(400).json({message:"Invalid JSON body"});
    }
    return res.status(500).json({message:"Something went wrong"});
});
