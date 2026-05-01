import dotenv from "dotenv";
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import { errorHandler } from "./middlewares/error.middleware.js";
dotenv.config({
    path:"./.env"
})

const app = express()
// app.use(cors({
//     origin: process.env.CORS_ORIGN
// }))




const allowedOrigins = [ 
  "http://localhost:8000",
  "http://localhost:3000",
  "http://localhost:3001",
  "https://yourfrontend.com"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS blocked"));
      }
    },
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "api_key"   
    ]
  })
);
         
app.use(express.json({limit:"16kb"}))
app.use(express.urlencoded({extended:true,limit:"16kb"}))
app.use(express.static("public"))


import userrouter from "./routes/user.routes.js";
import adminrouter from"./routes/admin.routes.js";
import productrouter from "./routes/product.routes.js";
import orderrouter from "./routes/order.routes.js";



app.use("/api/v1/users",userrouter)
app.use("/api/v1/admin",adminrouter)
app.use("/api/v1/products",productrouter)
app.use("/api/v1/orders",orderrouter)


app.use(errorHandler); 


export {app}