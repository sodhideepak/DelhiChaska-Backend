import { asynchandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { user } from "../models/user.model.js";
import { otp } from "../models/otp.model.js";
import { TempUser } from "../models/temp_login.model.js";
import { uploadoncloudinary,deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import * as nodemailer from "nodemailer"
import Randomstring from "randomstring";
import bcrypt from "bcrypt";



const sendresetpasswordmail=asynchandler(async(fullname,email,token)=>{

    try {
        const transporter =nodemailer.createTransport({
            host:"smtp.gmail.com",
            port:465,
            secure:true,
            tls:{
                rejectUnauthorized:false
            },
            // service:"gmail",
            auth:{
                user:process.env.emailusername,
                pass:process.env.emailpassword
            }
        })

        const mailoptions={
            from:process.env.emailusername,
            to:email,
            subject:"for reset passowrd",
            // html:'<p> hii '+fullname+', please copy the link and <a href="https://forgotpassword.heetox.com/?token='+token+'" > reset your password </a></p>'

            html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center;">
            <h2 style="color: #1ec559; font-size: 40px;">Heetox</h2>
            <h3 style="color: #444; font-size: 25px;">Reset Password</h3>
        </div>
        <div style="padding: 10px; text-align: center;">
            <p style="font-size: 18px; color: #000000;">
            Hii ${fullname}<br>
                Follow this link to Reset your password<br>
                <span style="font-size: 24px; font-weight: bold; color: #000;"><a href="https://forgotpassword.heetox.com/?token=${token}" > Link </a></span>
            </p>
           
        </div>
        
        <div style="margin-top: 30px; text-align: center; color: #aaa; font-size: 12px;">
            <p>If you did not request this, please ignore this email.</p>
            <p>&copy; 2024 Heetox. All rights reserved.</p>
        </div>
    </div>
    `
    

        }

        transporter.sendMail(mailoptions,function(error,info){
            if (error) {
                console.log(error)
            } else {
                console.log("mail has been sent :=",info.response);                
            }
        })

        
    } catch (error) {
        throw new ApiError(400,error.message)
    }
})



const send_register_otp=asynchandler(async(email,otp,expiresAt)=>{

    try {
        const transporter =nodemailer.createTransport({
            host:"smtp.gmail.com",
            port:465,
            secure:true,
            tls:{
                rejectUnauthorized:false
            },
            // service:"gmail",
            auth:{
                user:process.env.emailusername,
                pass:process.env.emailpassword
            }
        })
// console.log("hello")
        const mailoptions={
            from:process.env.emailusername,
            to:email,
            subject: "OTP to Register on Heetox",
    html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center;">
            <h2 style="color: #333;">Heetox</h2>
            <h3 style="color: #444;">OTP Verification</h3>
        </div>
        <div style="padding: 20px; text-align: center;">
            <p style="font-size: 16px; color: #555;">
                Your OTP to register successfully is
                <span style="font-size: 24px; font-weight: bold; color: #000;">${otp}</span>
            </p>
            <p style="font-size: 14px; color: #999;">
                This OTP will expire in
                <span style="font-size: 16px; font-weight: bold; color: #000;">${expiresAt}</span>.
            </p>
        </div>
        
        <div style="margin-top: 30px; text-align: center; color: #aaa; font-size: 12px;">
            <p>If you did not request this OTP, please ignore this email.</p>
            <p>&copy; 2024 Heetox. All rights reserved.</p>
        </div>
    </div>
    `
        }

        transporter.sendMail(mailoptions,function(error,info){
            if (error) {
                console.log(error)
            } else {
                console.log("mail has been sent :=",info.response);                
            }
        })

        
    } catch (error) {
        throw new ApiError(400,error.message)
    }
})



const generateAccessAndRefreshTokens=async(userid)=>{
    try {
        const User = await user.findById(userid)
        // console.log(User);
        const accesstoken = User.generateAccessToken()
        const refreshtoken = User.generateRefreshToken()
        // console.log(refreshtoken);
        User.refreshToken=refreshtoken
        // console.log("1 :",User.refreshtoken);
        // console.log("2 :",refreshtoken);
        await User.save({ validateBeforeSave: false })


        return{accesstoken,refreshtoken}
    
    } catch (error) {
        throw new ApiError(500,"something went wrong while generating access and refresh token")
    }
}



const calculate_age = function calculateAge(dob) {
    const dobDate = new Date(dob);
    // const today = new Date();
    // const today = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const var_today = new Date();
    const indiaTimeOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
    const utcTime = var_today.getTime() + (var_today.getTimezoneOffset() * 60000); // Convert to UTC
    const today = new Date(utcTime + indiaTimeOffset);
    
    // console.log(today);
    // console.log(indiaTime);
    
 
    let years = today.getFullYear() - dobDate.getFullYear();
    let months = today.getMonth() - dobDate.getMonth();
    let days = today.getDate() - dobDate.getDate();

    if (days < 0) {
        months--;
        days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    }

    if (months < 0) {
        years--;
        months += 12;
    }

    return `${years} years ${months} months ${days} days`;
}


const startRegistration = asynchandler(async (req, res) => {

    const { full_name, email, phone_number, gender, DOB, password } = req.body;

    if ([full_name, email, phone_number, gender, DOB, password]
        .some(field => !field || field.toString().trim() === "")) {

        throw new ApiError(400, "All fields are required");
    }

    const existingUser = await user.findOne({
        $or: [{ email }, { phone_number }]
    });

    if (existingUser) {
        throw new ApiError(409, "User already exists");
    }

    // generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = "10 minutes";

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    await TempUser.create({
        full_name,
        email,
        phone_number,
        gender,
        DOB,
        password: hashedPassword,
        otp,
        otp_expires: Date.now() + 10 * 60 * 1000
    });

    // send OTP mail
    await send_register_otp(email, otp, expiresAt);

    return res.status(200).json(
        new ApiResponse(200, {}, "OTP sent to email")
    );

});




const verifyEmail_registeruser = asynchandler(async (req, res) => {

    const { email, otp } = req.body;

    const tempUser = await TempUser.findOne({ email });

    if (!tempUser) {
        throw new ApiError(400, "Registration session expired");
    }

    if (tempUser.otp !== otp) {
        throw new ApiError(400, "Invalid OTP");
    }

    if (tempUser.otp_expires < Date.now()) {
        throw new ApiError(400, "OTP expired");
    }
console.log(tempUser);

    // create real user
    const newUser = new user({
        full_name: tempUser.full_name,
        email: tempUser.email,
        phone_number: tempUser.phone_number,
        gender: tempUser.gender,
        DOB: tempUser.DOB,
        is_email_verified: true,
        avatar: ""
    });

    newUser.password = tempUser.password;

    // skip hashing again
    newUser.$__.activePaths.clear("modify");

    await newUser.save();

    // delete temp user
    await TempUser.deleteOne({ email });

    // ===== LOGIN LOGIC START =====
    const { accesstoken, refreshtoken } = await generateAccessAndRefreshTokens(newUser._id);

    const loggedinuser = await user
        .findById(newUser._id)
        .select("-password -refreshToken -token")
        .lean();

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
        .status(201)
        .cookie("accesstoken", accesstoken, options)
        .cookie("refreshtoken", refreshtoken, options)
        .json(
            new ApiResponse(
                201,
                {
                    user: loggedinuser,
                    accesstoken,
                    refreshtoken
                },
                "User registered and logged in successfully"
            )
        );
});




const registeruser = asynchandler(async (req,res)=>{
    
    
    const {fullname,email,phone_number,gender,DOB,password}= req.body
    

    if([fullname,email,phone_number,gender,password,DOB].some((field)=> field?.trim()==="")) {
        throw new ApiError(400,"all fields are required")
    }
    const existeduser = await user.findOne(
        {
            $or:[{phone_number},{email}]
        }
    )

    if (existeduser) {
        console.log("hello")
        throw new ApiError(409,"user already registered",[])

    }
     
   
    const User=await user.create({
        fullname,
        email,
        DOB,
        gender,
        password,
        phone_number,
        is_email_verified:0,
        avatar:""

    })

    const createduser =await user.findById( User._id).select("-password -refreshToken -token");    

    if (!createduser) {
        throw new ApiError(500,"something went wrong while registering the user");
    }

    return res.status(201).json(
        new ApiResponse(200,createduser,"user registered sucessfully")
    )

})



// Register → Verify Email → Login
//                          ↓
//                      Add Address





const send_otp = asynchandler(async(req,res)=>{



    const email = req.body.email

    if (email) {
        const ramdomotp=Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000);
        await otp.create({
            email,
            Otp:ramdomotp,
            expiresAt:expiresAt

        })

        send_register_otp(email,ramdomotp,expiresAt)

       return res
       .status(200)
       .json(new ApiResponse(200,"mail has been sent sucessfully"))
    } else {
        throw new ApiError(200,"user email is not fetched")
    }


})





const loginuser = asynchandler(async (req,res)=>{


    const {email,password}= req.body

    if (!email ) {
        throw new ApiError(400,"username or email is required")     
    }

    const User = await user.findOne({
        $or:[ {email}]
    })

    if (!User) {
        throw new ApiError(400, "user does not exist")
        
    }
    

    
    const ispasswordvalid= await User.isPasswordcorrect(password)
    
    if (!ispasswordvalid) {

        throw new ApiError(400,"invlid user credientials")
        
    } 

    const {accesstoken,refreshtoken} = await generateAccessAndRefreshTokens(User._id)

    const loggedinuser =await user.findById( User._id).select("-password -refreshToken -token").lean();
   
    const options={
        httpOnly:true,
        secure:true,
    }

    return res
    .status(200)
    .cookie("accesstoken",accesstoken,options)
    .cookie("refreshtoken",refreshtoken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedinuser,accesstoken,refreshtoken
            },
            "user logged in sucessfully")
    )

})





const logout =asynchandler(async(req,res)=>{
    await user.findByIdAndUpdate(
        req.user._id,{
            $unset: {
                refreshToken: 1 // this removes the field from document
            },
           
        },
        {
            new:true
        }
    )
    

    

    const options={
        httpOnly:true,
        secure:true,
    }

    return res
    .status(200)
    .clearCookie("accesstoken",options)
    .clearCookie("refreshtoken",options)
    .json(
        new ApiResponse(
            200,
            {},
            "user logged out sucessfully")
    )


})





const delete_account =asynchandler(async(req,res)=>{



    const {email,password}= req.body

    if (!email ) {
        throw new ApiError(400,"username or email is required")     
    }

    const User = await user.findOne({
        $or:[ {email}]
    })

    if (!User) {
        throw new ApiError(400, "user does not exist")
        
    }
    

    
    const ispasswordvalid= await User.isPasswordcorrect(password)
    
    if (!ispasswordvalid) {

        throw new ApiError(400,"invlid user credientials")
        
    } 
    await user.findByIdAndDelete(
        User._id
    )
    

    const options={
        httpOnly:true,
        secure:true,
    }

    return res
    .status(200)
    .clearCookie("accesstoken",options)
    .clearCookie("refreshtoken",options)
    .json(
        new ApiResponse(
            200,
            {},
            "User Account deleted Sucessfully")
    )


})





const refreshAccessToken = asynchandler(async(req,res)=>{
    // console.log("req.body : ",req.body);

    // const incomingrefreshtoken = req.cookies.refreshToken || req.body.refreshToken
    const incomingrefreshtoken = req.body.refreshToken || req.cookies.refreshToken
    
    if(!incomingrefreshtoken){
        throw new ApiError(401,"unauthorized request")
    }
    
    try {
        const decodedtoken = jwt.verify(
            incomingrefreshtoken,
            process.env.Refresh_Token_Secret
        )
    
        // console.log("decodedtoken : ",decodedtoken);
        // console.log("decodedtoken id : ",decodedtoken?._id);
        const User = await user.findById(decodedtoken?._id)
        
        // console.log(User);
        if(!user){
            throw new ApiError(401,"invalid refresh token")
        }
        
        // console.log("incomminrefreshtoken : ",incomingrefreshtoken);
        console.log("User?.refreshToken : ",User?.refreshToken);

        if(incomingrefreshtoken !== User?.refreshToken){
            throw new ApiError(401,"refresh token is expired or used")
        }
    
        const options ={
            httpOnly:true,
            secure:true
        }
    
        const {accesstoken,refreshtoken}=await generateAccessAndRefreshTokens(decodedtoken?._id)

        // console.log("newrefreshtoken : ",refreshtoken);
        // console.log("accesstoken : ",accesstoken);
    
        return res.status(200)
        .cookie("accesstoken",accesstoken,options)
        .cookie("refreshtoken",refreshtoken,options)
        .json(
            new ApiResponse(
                200,
                {
                    accesstoken, refreshtoken:refreshtoken
                },
                "access token refreshed sucessfully"
            )
        )
    
    } catch (error) {
        throw new ApiError(401,error?.message || "invalid refresh token")
    }
})





const changeCurrentPassword = asynchandler(async(req,res)=>{
    const {oldpassword,newpassword}=req.body

    const User = await user.findById(req.user?._id)
    const isPasswordcorrect = await User.isPasswordcorrect(oldpassword)

    if (!isPasswordcorrect) {
        throw new ApiError(400,"invalid password")
        
    }

    User.password=newpassword
    await User.save({validateBeforeSave:false})

    return res
    .status(200)
    .json(new ApiResponse(200,"password changed sucessfully"))
})




const getCurrentuser =asynchandler(async(req,res)=>{

   

    const user_data= await user.findById(req.user._id).select("-password -refreshToken -token ").lean();

    return res
    .status(200)
    .json(new ApiResponse(200,user_data,"user fetched sucessfully"))
    // .json(new ApiResponse(200,req.user,"user fetched sucessfully"))

})






const updateAccountDetails =asynchandler(async(req,res)=>{

    const {fullname,email,gender,phone_number,DOB}=req.body
    const user_data = await user.findById(req.user._id)

    if(!fullname || !email){
        throw new ApiError(400,"all fields are required")
    }
    let is_email_verified;
    if(user_data.email==email&user_data.is_email_verified==true){
        is_email_verified=1
    }else{
        is_email_verified=0
    }

    const userdata =await user.findByIdAndUpdate(
        user_data._id,{
            $set: {
                fullname,
                email,
                phone_number,
                DOB,
                gender,
                is_email_verified
            },
           
        }, 
        {
            new:true
        }
    ).select("-password -refreshToken -token").lean()

 
    const year = userdata.DOB.getUTCFullYear();
    const month = (userdata.DOB.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = userdata.DOB.getUTCDate().toString().padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    userdata.DOB=formattedDate
    userdata.age=calculate_age(userdata.DOB)

  
    return res
    .status(200)
    .json(new ApiResponse(200,userdata,"user account details updated sucessfully"))

})






const re_verifyemail = asynchandler(async(req,res)=>{



    const {email,Otp}=req.body
    const User =await user.findOne({email:email})

    const verifyotp = await otp.findOne(
        { email: email, Otp: Otp }
    );
    
    if(verifyotp){
        await otp.deleteOne({ _id: verifyotp._id })
    }
    else{
        throw new ApiError(409,"invalid otp")
    }


    const userdata=await user.findByIdAndUpdate(
        User._id,{
            $set: {
                email:email,
                is_email_verified:1

             
            },
           
        },
        {
            new:true
        }
    ).select("-password -refreshToken -token").lean()


    const year = userdata.DOB.getUTCFullYear();
    const month = (userdata.DOB.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = userdata.DOB.getUTCDate().toString().padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;


    userdata.DOB=formattedDate
    userdata.age=calculate_age(userdata.DOB)

   
       return res
       .status(200)
       .json(new ApiResponse(200,userdata,"mail has been updated sucessfully"))
    


})



const updateUserAvatar =asynchandler(async(req,res)=>{
    
    const avatarlocalpath=req.file?.path

    const user_data =  await user.findById(req.user._id);

    if (!avatarlocalpath) {
        throw new ApiError(400,"avatar file is mssing")

    }

    if(user_data.avatar){
        console.log("deleting avatar")
        await deleteFromCloudinary(user_data.avatar)
    }

    const avatar=await uploadoncloudinary(avatarlocalpath)

    if (!avatar.url) {
        throw new ApiError(400,"error while uploading an avatar")
    }
    avatar.url = avatar.url.replace(/^http:/, 'https:');
    const response= await user.findByIdAndUpdate(
        req.user._id,{
            $set: {
                avatar:avatar.url
            },
           
        },
        {
            new:true
        }
    ).select("-password -refreshToken -token").lean()

    const year = response.DOB.getUTCFullYear();
    const month = (response.DOB.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = response.DOB.getUTCDate().toString().padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;


    response.DOB=formattedDate
    response.age=calculate_age(response.DOB)
    return res
    .status(200)
    .json(new ApiResponse(200,response,"coverimage updated sucessfully"))

})



const removeUserAvatar =asynchandler(async(req,res)=>{


    const user_data = await user.findById(req.user._id);
    if(user_data.avatar){
        console.log("deleting avatar")
        await deleteFromCloudinary(user_data.avatar)
    }
    

    const response= await user.findByIdAndUpdate(
        user_data._id,{
            $set: {
                avatar:""
            },
           
        },
        {
            new:true
        }
    ).select("-password -refreshToken -token").lean()

    const year = response.DOB.getUTCFullYear();
    const month = (response.DOB.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = response.DOB.getUTCDate().toString().padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;


    response.DOB=formattedDate
    response.age=calculate_age(response.DOB)

    return res
    .status(200)
    .json(new ApiResponse(200,response,"UserAvatar removed sucessfully"))

})









const forgotpassword = asynchandler(async(req,res)=>{

// before production just change the link address to render addresss of which the email is send to user
// change the address of mail in mail optins in the send password reset mail

        const email = req.body.email
        const userdata =await user.findOne({email:email})

        if (userdata) {
            const ramdomotp=Randomstring.generate()
            await user.updateOne({email:email},{$set:{token:ramdomotp}})

           sendresetpasswordmail(userdata.fullname,userdata.email,ramdomotp)

           return res
           .status(200)
           .json(new ApiResponse(200,"mail has been sent sucessfully"))
        } else {
            throw new ApiError(404,"user email does not exist")
        }
    

})
















const sendenquirymail=asynchandler(async(fullname,email,token)=>{

    try {
        const transporter =nodemailer.createTransport({
            host:"smtp.gmail.com",
            port:465,
            secure:true,
            tls:{
                rejectUnauthorized:false
            },
            // service:"gmail",
            auth:{
                user:process.env.emailusername,
                pass:process.env.emailpassword
            }
        })

        const mailoptions = {
            from: process.env.emailusername,
            to: email, // This should be the admin or CoachSahb's email receiving the request
            subject: "New Service Request from CoachSahb Website",
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center;">
                    <h2 style="color: #1ec559; font-size: 40px;">CoachSahb</h2>
                    <h3 style="color: #444; font-size: 25px;">New Booking Inquiry</h3>
                </div>
                <div style="padding: 10px; font-size: 16px; color: #333;">
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Phone Number:</strong> ${phone_number}</p>
                    <p><strong>Service Needed:</strong> ${service_needed}</p>
                    <p><strong>Preferred Date:</strong> ${preffered_date}</p>
                    <p><strong>Preferred Time:</strong> ${preffered_time}</p>
                    <p><strong>Project Details:</strong><br>${project_details}</p>
                </div>
                <div style="margin-top: 30px; text-align: center; color: #aaa; font-size: 12px;">
                    <p>This email was generated from a client inquiry form.</p>
                    <p>&copy; 2024 CoachSahb. All rights reserved.</p>
                </div>
            </div>
            `
        };

        transporter.sendMail(mailoptions,function(error,info){
            if (error) {
                console.log(error)
            } else {
                console.log("mail has been sent :=",info.response);                
            }
        })

        
    } catch (error) {
        throw new ApiError(400,error.message)
    }
})






const sendbookingsessionmail=asynchandler(async(fullname,email,token)=>{

    try {
        const transporter =nodemailer.createTransport({
            host:"smtp.gmail.com",
            port:465,
            secure:true,
            tls:{
                rejectUnauthorized:false
            },
            // service:"gmail",
            auth:{
                user:process.env.emailusername,
                pass:process.env.emailpassword
            }
        })

        const mailoptions = {
            from: process.env.emailusername,
            to: email, // Replace with admin/CoachSahb email if needed
            subject: "New Booking Session Inquiry - " + subject,
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center;">
                    <h2 style="color: #1ec559; font-size: 40px;">CoachSahb</h2>
                    <h3 style="color: #444; font-size: 25px;">New Booking Session Request</h3>
                </div>
                <div style="padding: 10px; font-size: 16px; color: #333;">
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Message:</strong><br>${message}</p>
                </div>
                <div style="margin-top: 30px; text-align: center; color: #aaa; font-size: 12px;">
                    <p>This email was generated from the booking session form on the website.</p>
                    <p>&copy; 2024 CoachSahb. All rights reserved.</p>
                </div>
            </div>
            `
        };
        

        transporter.sendMail(mailoptions,function(error,info){
            if (error) {
                console.log(error)
            } else {
                console.log("mail has been sent :=",info.response);                
            }
        })

        
    } catch (error) {
        throw new ApiError(400,error.message)
    }
})







const contactformenquiry = asynchandler(async(req,res)=>{

    // before production just change the link address to render addresss of which the email is send to user
    // change the address of mail in mail optins in the send password reset mail
    
            const { name, email, subject, message } = req.body;
            try {
                await sendContactFormMail(name, email, subject, message); // Send email to admin
            
                return res
                    .status(200)
                    .json(new ApiResponse(200, "Your message has been sent successfully."));
            } catch (error) {
                console.error("Error sending contact form mail:", error);
                throw new ApiError(500, "Failed to send message. Please try again later.");
            }
        
    
    })



const bookingformenquiry = asynchandler(async(req,res)=>{

        // before production just change the link address to render addresss of which the email is send to user
        // change the address of mail in mail optins in the send password reset mail
        
                const email = req.body.email
                const userdata =await user.findOne({email:email})
        
                if (userdata) {
                    const ramdomotp=Randomstring.generate()
                    await user.updateOne({email:email},{$set:{token:ramdomotp}})
        
                   sendresetpasswordmail(userdata.fullname,userdata.email,ramdomotp)
        
                   return res
                   .status(200)
                   .json(new ApiResponse(200,"mail has been sent sucessfully"))
                } else {
                    throw new ApiError(404,"user email does not exist")
                }
            
        
        })
    





const resetpassword = asynchandler(async(req,res)=>{

    // before production just change the link address to render addresss of which the email is send to user
    // change the address of mail in mail optins in the send password reset mail
    const token =req.query.token

    const User = await user.findOne({token:token})

    if (User) {
        const newpassword =req.body.password
        User.password=newpassword
        await User.save({validateBeforeSave:false})
        await user.findByIdAndUpdate({_id:User._id},{$set:{token:''}},{new:true})
    
    } else {
        throw new ApiError(400,"link has been expired")
    }
    
   
    return res
    .status(200)
    .json(new ApiResponse(200,{},"password changed sucessfully"))
})






export {
        registeruser,
        startRegistration,
        send_otp,
        loginuser,
        logout,
        delete_account,
        verifyEmail_registeruser,
        refreshAccessToken,
        changeCurrentPassword,
        getCurrentuser,
        updateAccountDetails,
        updateUserAvatar,
        removeUserAvatar,
        forgotpassword,
        resetpassword,
        contactformenquiry,
        bookingformenquiry

    }
