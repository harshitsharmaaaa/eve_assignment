import z from "zod";
import {credentials} from "../routes/auth.routes";
import {createCenter,createTest} from "../routes/center.route";
import {bookTest} from "../routes/booking.route";
import {makePayment,paymentWebhook} from "../routes/payment.route";

function json(schema:z.ZodType){
    return z.toJSONSchema(schema,{unrepresentable:"any"});
}

export const openapi = {
    openapi:"3.0.0",
    info:{title:"EVE Healthcare",version:"1.0.0"},
    components:{
        securitySchemes:{
            bearer:{type:"http",scheme:"bearer",bearerFormat:"JWT"},
        },
        schemas:{
            Signup:json(credentials),
            CreateCenter:json(createCenter),
            CreateTest:json(createTest),
            BookTest:json(bookTest),
            MakePayment:json(makePayment),
            PaymentWebhook:json(paymentWebhook),
        },
    },
    paths:{
        "/auth/signup":{post:{requestBody:{content:{"application/json":{schema:json(credentials)}}},responses:{"201":{description:"created"}}}},
        "/auth/login":{post:{requestBody:{content:{"application/json":{schema:json(credentials)}}},responses:{"200":{description:"ok"}}}},
        "/centers":{get:{responses:{"200":{description:"ok"}}},post:{requestBody:{content:{"application/json":{schema:json(createCenter)}}},responses:{"201":{description:"created"}}}},
        "/centers/{id}":{get:{responses:{"200":{description:"ok"},"404":{description:"not found"}}}},
        "/centers/{id}/tests":{post:{requestBody:{content:{"application/json":{schema:json(createTest)}}},responses:{"201":{description:"created"},"404":{description:"not found"}}}},
        "/bookings/book":{post:{security:[{bearer:[]}],requestBody:{content:{"application/json":{schema:json(bookTest)}}},responses:{"201":{description:"created"},"404":{description:"not found"}}}},
        "/bookings":{get:{security:[{bearer:[]}],responses:{"200":{description:"ok"}}}},
        "/bookings/{id}":{get:{security:[{bearer:[]}],responses:{"200":{description:"ok"},"403":{description:"forbidden"},"404":{description:"not found"}}}},
        "/bookings/{id}/cancel":{post:{security:[{bearer:[]}],responses:{"200":{description:"ok"},"403":{description:"forbidden"},"404":{description:"not found"},"409":{description:"conflict"}}}},
        "/payments":{post:{security:[{bearer:[]}],requestBody:{content:{"application/json":{schema:json(makePayment)}}},responses:{"201":{description:"created"},"403":{description:"forbidden"},"404":{description:"not found"},"409":{description:"conflict"}}}},
        "/payments/webhook":{post:{requestBody:{content:{"application/json":{schema:json(paymentWebhook)}}},responses:{"200":{description:"ok"},"404":{description:"not found"}}}},
    },
};
