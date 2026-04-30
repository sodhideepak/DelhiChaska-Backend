import { asynchandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { user } from "../models/user.model.js";
import { otp } from "../models/otp.model.js";
import { TempUser } from "../models/temp_login.model.js";
import { Employee } from "../models/employee.model.js";
import { TempEmployee } from "../models/temp_employee.model.js";
import { ZipCode } from "../models/zipcode.model.js";
import { uploadoncloudinary,deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import * as nodemailer from "nodemailer"
import Randomstring from "randomstring";
import bcrypt from "bcrypt";
import { Order }   from "../models/order.model.js";
import { Cart }    from "../models/cart.model.js";
import { Product } from "../models/product.model.js";
import { Address } from "../models/address.model.js";




const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "deepaksodhi0023@gmail.com";
const HARD_CODED_SUPER_ADMIN_ROLE = "super_admin";

// Utility function to calculate age
const calculate_age = function calculateAge(dob) {
    const dobDate = new Date(dob);
    const var_today = new Date();
    const indiaTimeOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
    const utcTime = var_today.getTime() + (var_today.getTimezoneOffset() * 60000); // Convert to UTC
    const today = new Date(utcTime + indiaTimeOffset);

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

const ensureSuperAdmin = (req) => {
    const isSuperAdmin = req.staff?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
console.log(req.staff?.email?.toLowerCase());
console.log(SUPER_ADMIN_EMAIL.toLowerCase());


    if (!isSuperAdmin) {
        throw new ApiError(403, "only super admin can perform this action");
    }

    return {
        role: HARD_CODED_SUPER_ADMIN_ROLE,
        email: req.staff.email
    };
};



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




const generateAccessAndRefreshTokens=async(userid)=>{
    try {
        const employee = await Employee.findById(userid)
        // console.log(User);
        const accesstoken = employee.generateAccessToken()
        const refreshtoken = employee.generateRefreshToken()
        // console.log(refreshtoken);
        employee.refreshToken=refreshtoken
        // console.log("1 :",User.refreshtoken);
        // console.log("2 :",refreshtoken);
        await employee.save({ validateBeforeSave: false })


        return{accesstoken,refreshtoken}
    
    } catch (error) {
        throw new ApiError(500,"something went wrong while generating access and refresh token")
    }
}



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

    // const api=req.headers.api_key;
    const api=req.headers.apikey;
    console.log(api);
    

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
        secure:false,
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




// Email notification function for new employee registration
const sendEmployeeRegistrationNotification = async(employeeName, employeeEmail, role) => {
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        tls: {
            rejectUnauthorized: false
        },
        auth: {
            user: process.env.emailusername,
            pass: process.env.emailpassword
        }
    });

    const mailOptions = {
        from: process.env.emailusername,
        to: SUPER_ADMIN_EMAIL,
        subject: "New Employee Registration - DelhiChaska Backend",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center;">
                    <h2 style="color: #ff6b35; font-size: 40px;">DelhiChaska</h2>
                    <h3 style="color: #444; font-size: 25px;">New Employee Registration</h3>
                </div>
                <div style="padding: 10px; font-size: 16px; color: #333;">
                    <p><strong>Name:</strong> ${employeeName}</p>
                    <p><strong>Email:</strong> ${employeeEmail}</p>
                    <p><strong>Role:</strong> ${role}</p>
                    <p><strong>Status:</strong> Pending Verification</p>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <p style="font-size: 18px; color: #666;">
                        A new employee has submitted their registration and is waiting for your approval.
                    </p>
                </div>
                <div style="margin-top: 30px; text-align: center; color: #aaa; font-size: 12px;">
                    <p>Please log in to the admin panel to review and approve this registration.</p>
                    <p>&copy; 2024 DelhiChaska. All rights reserved.</p>
                </div>
            </div>
        `
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                console.log("Error sending admin notification:", error);
                reject(new ApiError(500, "Failed to send admin notification email"));
            } else {
                console.log("Admin notification sent:", info.response);
                resolve(info);
            }
        });
    });
};

// Email notification function for employee about registration submission
const sendEmployeeSubmissionConfirmation = async(employeeName, employeeEmail) => {
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        tls: {
            rejectUnauthorized: false
        },
        auth: {
            user: process.env.emailusername,
            pass: process.env.emailpassword
        }
    });

    const mailOptions = {
        from: process.env.emailusername,
        to: employeeEmail,
        subject: "Registration Submitted - Under Review",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center;">
                    <h2 style="color: #ff6b35; font-size: 40px;">DelhiChaska</h2>
                    <h3 style="color: #444; font-size: 25px;">Registration Under Review</h3>
                </div>
                <div style="padding: 10px; text-align: center;">
                    <p style="font-size: 18px; color: #333;">
                        Hi ${employeeName},<br><br>
                        Thank you for submitting your employee registration application.
                    </p>
                    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
                        <p style="font-size: 16px; color: #856404; margin: 0;">
                            <strong>Your application is currently under review by our super admin.</strong><br>
                            We'll notify you once your registration has been approved.
                        </p>
                    </div>
                    <p style="font-size: 16px; color: #666;">
                        This process typically takes 24-48 hours. We appreciate your patience!
                    </p>
                </div>
                <div style="margin-top: 30px; text-align: center; color: #aaa; font-size: 12px;">
                    <p>If you have any questions, please contact our support team.</p>
                    <p>&copy; 2024 DelhiChaska. All rights reserved.</p>
                </div>
            </div>
        `
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                console.log("Error sending employee confirmation:", error);
                reject(new ApiError(500, "Failed to send employee confirmation email"));
            } else {
                console.log("Employee confirmation sent:", info.response);
                resolve(info);
            }
        });
    });
};

// Email notification function for employee approval
const sendEmployeeApprovalNotification = async(employeeName, employeeEmail, role) => {
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        tls: {
            rejectUnauthorized: false
        },
        auth: {
            user: process.env.emailusername,
            pass: process.env.emailpassword
        }
    });

    const mailOptions = {
        from: process.env.emailusername,
        to: employeeEmail,
        subject: "Registration Approved - Welcome to DelhiChaska!",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center;">
                    <h2 style="color: #ff6b35; font-size: 40px;">DelhiChaska</h2>
                    <h3 style="color: #28a745; font-size: 25px;">🎉 Registration Approved!</h3>
                </div>
                <div style="padding: 10px; text-align: center;">
                    <p style="font-size: 18px; color: #333;">
                        Congratulations ${employeeName}!<br><br>
                        Your employee registration has been approved by our super admin.
                    </p>
                    <div style="background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; padding: 15px; margin: 20px 0;">
                        <p style="font-size: 16px; color: #155724; margin: 0;">
                            <strong>Welcome to the DelhiChaska team!</strong><br>
                            Role: ${role}<br>
                            Status: Verified
                        </p>
                    </div>
                    <p style="font-size: 16px; color: #666;">
                        You can now access the employee portal with your registered credentials.
                    </p>
                </div>
                <div style="margin-top: 30px; text-align: center; color: #aaa; font-size: 12px;">
                    <p>If you need any help getting started, please contact your supervisor.</p>
                    <p>&copy; 2024 DelhiChaska. All rights reserved.</p>
                </div>
            </div>
        `
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                console.log("Error sending approval notification:", error);
                reject(new ApiError(500, "Failed to send approval notification email"));
            } else {
                console.log("Approval notification sent:", info.response);
                resolve(info);
            }
        });
    });
};

const startEmployeeRegistration = asynchandler(async(req,res)=>{
    const {
        name,
        email,
        phone,
        password,
        role,
        profile_image
    } = req.body

    if ([name, email, phone, password, role].some((field) => !field || field.toString().trim() === "")) {
        throw new ApiError(400, "name, email, phone, password and role are required");
    }

    const existingEmployee = await Employee.findOne({
        $or: [{ email }, { phone }]
    });

    if (existingEmployee) {
        throw new ApiError(409, "employee already exists");
    }

    const existingTempEmployee = await TempEmployee.findOne({
        $or: [{ email }, { phone }]
    });

    if (existingTempEmployee) {
        throw new ApiError(409, "employee registration is already pending for verification");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const tempEmployee = await TempEmployee.create({
        name,
        email,
        phone,
        password: hashedPassword,
        role,
        status: "not_verified",
        profile_image: profile_image || ""
    });

    // Send notification emails (non-blocking)
    let emailStatus = "emails sent successfully";

    // Send admin notification
    sendEmployeeRegistrationNotification(name, email, role).catch(error => {
        console.log("Failed to send admin notification:", error.message);
        emailStatus = "registration successful, but admin notification failed";
    });

    // Send employee confirmation
    sendEmployeeSubmissionConfirmation(name, email).catch(error => {
        console.log("Failed to send employee confirmation:", error.message);
        emailStatus = "registration successful, but employee confirmation failed";
    });

    return res
    .status(201)
    .json(new ApiResponse(201, {
        id: tempEmployee._id,
        name: tempEmployee.name,
        email: tempEmployee.email,
        role: tempEmployee.role,
        status: tempEmployee.status,
        createdAt: tempEmployee.createdAt
    }, `employee registration submitted successfully! ${emailStatus}`))
})



const loginStaff = asynchandler(async (req, res) => {

    const { email, password } = req.body;

    const api = req.headers.apikey;
    console.log(api);

    // ==========================
    // 🔒 Validation
    // ==========================
    if (!email) {
        throw new ApiError(400, "email is required");
    }

    // ==========================
    // 🔍 Find Employee
    // ==========================
    const staff = await Employee.findOne({
        $or: [{ email }]
    });

    if (!staff) {
        throw new ApiError(400, "staff does not exist");
    }

    // ==========================
    // 🚫 Check Approval (important for staff)
    // ==========================
    if (staff.status !== "verified") {
        throw new ApiError(403, "Your account is not verified yet");
    }

    // ==========================
    // 🔑 Password Check
    // ==========================
    const isPasswordValid = await staff.isPasswordcorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(400, "invalid staff credentials");
    }

    // ==========================
    // 🎟️ Tokens
    // ==========================
    const { accesstoken, refreshtoken } = await generateAccessAndRefreshTokens(staff._id);

    // ==========================
    // 📦 Clean User Data
    // ==========================
    const loggedInStaff = await Employee.findById(staff._id)
        .select("-password -refreshToken -token")
        .lean();

    // ==========================
    // 🍪 Cookie Options
    // ==========================
    const options = {
        httpOnly: true,
        secure: false,
    };

    // ==========================
    // 📤 Response
    // ==========================
    return res
        .status(200)
        .cookie("accesstoken", accesstoken, options)
        .cookie("refreshtoken", refreshtoken, options)
        .json(
            new ApiResponse(
                200,
                {
                    staff: loggedInStaff,
                    accesstoken,
                    refreshtoken
                },
                "staff logged in successfully"
            )
        );

});







// Get all employees by verification status
const getAllEmployeesByStatus = asynchandler(async(req,res)=>{
    ensureSuperAdmin(req);

    const { status } = req.query; // Can be 'verified', 'not_verified', or empty for all

    let filter = {};
    if (status && ['verified', 'not_verified', 'rejected'].includes(status)) {
        filter.status = status;
    }

    // Get verified employees
    const employees = await Employee.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .lean();

    // Get pending employees from temp collection if status is not_verified or no filter
    let tempEmployees = [];
    if (!status || status === 'not_verified') {
        tempEmployees = await TempEmployee.find({ status: 'not_verified' })
            .select("-password")
            .sort({ createdAt: -1 })
            .lean();
    }

    // Combine and format response
    const response = {
        verified_employees: status === 'not_verified' ? [] : employees,
        pending_employees: tempEmployees,
        total_verified: status === 'not_verified' ? 0 : employees.length,
        total_pending: tempEmployees.length,
        filter_applied: status || 'all'
    };

    return res
    .status(200)
    .json(new ApiResponse(200, response, `employees fetched successfully${status ? ` (filtered by: ${status})` : ''}`))
})

const getSuperAdminProfile = asynchandler(async(req,res)=>{
    const superAdmin = ensureSuperAdmin(req);

    const pendingEmployees = await TempEmployee.find({ status: "not_verified" })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            {
                super_admin: superAdmin,
                pendingEmployees
            },
            "super admin profile fetched successfully"
        )
    )
})






const verifyEmployeeRegistration = asynchandler(async(req,res)=>{
    ensureSuperAdmin(req);

    const { tempEmployeeId } = req.params;
    const tempEmployee = await TempEmployee.findById(tempEmployeeId);

    if (!tempEmployee) {
        throw new ApiError(404, "employee registration request not found");
    }

    const existingEmployee = await Employee.findOne({
        $or: [{ email: tempEmployee.email }, { phone: tempEmployee.phone }]
    });

    if (existingEmployee) {
        throw new ApiError(409, "employee already exists");
    }

    const employee = new Employee({
        name: tempEmployee.name,
        email: tempEmployee.email,
        phone: tempEmployee.phone,
        password: tempEmployee.password,
        role: tempEmployee.role,
        status: "verified",
        profile_image: tempEmployee.profile_image
    });

    employee.$__.activePaths.clear("modify");

    await employee.save();
    await TempEmployee.findByIdAndDelete(tempEmployeeId);

    // Send approval notification email to employee (non-blocking)
    let emailStatus = "approval notification sent successfully";

    sendEmployeeApprovalNotification(tempEmployee.name, tempEmployee.email, tempEmployee.role).catch(error => {
        console.log("Failed to send approval email:", error.message);
        emailStatus = "employee verified, but approval notification failed";
    });

    return res
    .status(201)
    .json(new ApiResponse(201,employee, `employee verified and registered successfully! ${emailStatus}`))
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







const sendContactFormMail = async(name, email, subject, message) => {
    try {
        const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            tls: {
                rejectUnauthorized: false
            },
            auth: {
                user: process.env.emailusername,
                pass: process.env.emailpassword
            }
        });

        const mailOptions = {
            from: process.env.emailusername,
            to: SUPER_ADMIN_EMAIL, // Send to super admin
            subject: `New Contact Form Message: ${subject}`,
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center;">
                    <h2 style="color: #ff6b35; font-size: 40px;">DelhiChaska</h2>
                    <h3 style="color: #444; font-size: 25px;">New Contact Form Message</h3>
                </div>
                <div style="padding: 10px; font-size: 16px; color: #333;">
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Message:</strong><br>${message}</p>
                </div>
                <div style="margin-top: 30px; text-align: center; color: #aaa; font-size: 12px;">
                    <p>This email was generated from the contact form on the website.</p>
                    <p>&copy; 2024 DelhiChaska. All rights reserved.</p>
                </div>
            </div>
            `
        };

        return new Promise((resolve, reject) => {
            transporter.sendMail(mailOptions, function(error, info) {
                if (error) {
                    console.log("Error sending contact form mail:", error);
                    reject(new ApiError(500, "Failed to send contact form email"));
                } else {
                    console.log("Contact form mail sent:", info.response);
                    resolve(info);
                }
            });
        });
    } catch (error) {
        throw new ApiError(400, error.message);
    }
};

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










const addZipPrefix = asynchandler(async (req, res) => {

    const { country, city, state, zip_prefix } = req.body;

    if (!country || !city || !state || !zip_prefix) {
        throw new ApiError(400, "All fields are required");
    }

    // if (!/^[0-9]{3}$/.test(zip_prefix)) {
    //     throw new ApiError(400, "Zip prefix must be exactly 3 digits");
    // }

    const existing = await ZipCode.findOne({
        country: country.toUpperCase(),
        zip_prefix
    });

    if (existing) {
        throw new ApiError(400, "Zip prefix already exists for this country");
    }

    const newZip = await ZipCode.create({
        country: country.toUpperCase(),
        city,
        state,
        zip_prefix
    });

    return res.status(201).json(
        new ApiResponse(201, newZip, "Zip prefix added successfully")
    );
});





const getZipPrefixes = asynchandler(async (req, res) => {

    const { country } = req.query;

    let filter = {};
    if (country) {
        filter.country = country.toUpperCase();
    }

    const data = await ZipCode.find(filter).sort({ createdAt: -1 });

    return res.status(200).json(
        new ApiResponse(200, data, "Zip prefixes fetched successfully")
    );
});




const deleteZipPrefix = asynchandler(async (req, res) => {

    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, "ID is required");
    }

    const deleted = await ZipCode.findByIdAndDelete(id);

    if (!deleted) {
        throw new ApiError(404, "Zip prefix not found");
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Zip prefix deleted successfully")
    );
});






const getCityByZip = asynchandler(async (req, res) => {

    const { zip, country } = req.params;

    if (!zip || zip.length < 3 || !country) {
        throw new ApiError(400, "Zip and country are required");
    }

    const prefix = zip.substring(0, 3);

    const result = await ZipCode.findOne({
        country: country.toUpperCase(),
        zip_prefix: prefix
    });

    if (!result) {
        throw new ApiError(404, "City not found for this ZIP");
    }

    return res.status(200).json(
        new ApiResponse(200, result, "City fetched successfully")
    );
});







// order controllers





// ─────────────────────────────────────────────
// 📋 VIEW ALL ORDERS (Admin)
// ─────────────────────────────────────────────
const adminViewAllOrders = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);
  // optional filters via query params
  // e.g. /admin/orders?status=pending&payment=cod&page=1&limit=10
  const { status, payment, page = 1, limit = 10 } = req.query;

  const filter = {};
  if (status)  filter.status           = status;
  if (payment) filter["payment.method"] = payment;

  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("userId", "full_name email phone_number")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Order.countDocuments(filter)
  ]);

  if (!orders || orders.length === 0) {
    return res.status(200).json(
      new ApiResponse(200, { orders: [], total: 0 }, "No orders found")
    );
  }

  const formattedOrders = orders.map(order => ({
    orderId:       order._id,
    user: {
      userId:      order.userId?._id,
      name:        order.userId?.full_name,
      email:       order.userId?.email,
      phone:       order.userId?.phone_number
    },
    status:        order.status,
    payment:       order.payment,
    totalAmount:   order.totalAmount,
    itemCount:     order.items.length,
    items:         order.items.map(item => ({
      productId:   item.productId,
      name:        item.name,
      quantity:    item.quantity,
      price:       item.price,
      type:        item.type,
      total:       item.price * item.quantity
    })),
    deliveryDetails: order.deliveryDetails,
    placedAt:      order.createdAt
  }));

  return res.status(200).json(
    new ApiResponse(200, {
      orders: formattedOrders,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    }, "Orders fetched successfully")
  );
});


// ─────────────────────────────────────────────
// 🔄 UPDATE ORDER STATUS (Admin)  → sends mail
// ─────────────────────────────────────────────
const adminUpdateOrderStatus = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);
  const { orderId } = req.params;
  const { status }  = req.body;

  const allowedStatuses = [
    "confirmed",
    "preparing",
    "out_for_delivery",
    "delivered",
    "cancelled"
  ];

  if (!status || !allowedStatuses.includes(status)) {
    throw new ApiError(
      400,
      `Invalid status. Allowed: ${allowedStatuses.join(", ")}`
    );
  }

  const order = await Order.findById(orderId)
    .populate("userId", "full_name email");

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  if (order.status === "delivered" || order.status === "cancelled") {
    throw new ApiError(
      400,
      `Cannot update a ${order.status} order`
    );
  }

  order.status = status;
  await order.save();

  // ── Send status update mail to user ──
  await send_order_status_mail(
    order.userId.email,
    order.userId.full_name,
    order,
    status
  );

  return res.status(200).json(
    new ApiResponse(200, {
      orderId:   order._id,
      newStatus: order.status
    }, `Order status updated to "${status}" and mail sent`)
  );
});


// ─────────────────────────────────────────────
// 💳 UPDATE PAYMENT STATUS (Admin)
// ─────────────────────────────────────────────
const adminUpdatePaymentStatus = asynchandler(async (req, res) => {
    ensureSuperAdmin(req);
  const { orderId }       = req.params;
  const { paymentStatus } = req.body;

  const allowedPaymentStatuses = ["pending", "paid", "failed"];

  if (!paymentStatus || !allowedPaymentStatuses.includes(paymentStatus)) {
    throw new ApiError(
      400,
      `Invalid payment status. Allowed: ${allowedPaymentStatuses.join(", ")}`
    );
  }

  const order = await Order.findById(orderId);

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  order.payment.status = paymentStatus;
  await order.save();

  return res.status(200).json(
    new ApiResponse(200, {
      orderId:           order._id,
      newPaymentStatus:  order.payment.status
    }, `Payment status updated to "${paymentStatus}"`)
  );
});




export {
        registeruser,
        startEmployeeRegistration,
        getSuperAdminProfile,
        getAllEmployeesByStatus,
        verifyEmployeeRegistration,
        send_otp,
        loginStaff,
        loginuser,
        logout,
        delete_account,
        refreshAccessToken,
        changeCurrentPassword,
        getCurrentuser,
        updateAccountDetails,
        updateUserAvatar,
        removeUserAvatar,
        forgotpassword,
        resetpassword,
        contactformenquiry,
        bookingformenquiry,
        addZipPrefix,
        getZipPrefixes,
        deleteZipPrefix,
        getCityByZip,
        adminViewAllOrders,
        adminUpdateOrderStatus,
        adminUpdatePaymentStatus

    }
