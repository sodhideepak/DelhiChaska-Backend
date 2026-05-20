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
import { sendEmail } from "../utils/sendutilmail.js";
import { Order }   from "../models/order.model.js";
import { Cart }    from "../models/cart.model.js";
import { Product } from "../models/product.model.js";
import { Address } from "../models/address.model.js";
import { DeliveryBatch } from "../models/deliveryBatch.model.js";

 



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

    // convert env string into array
    const superAdminEmails =
        process.env.SUPER_ADMIN_EMAILS
            ?.split(",")
            .map(email =>
                email.trim().toLowerCase()
            ) || [];

    const currentUserEmail =
        req.staff?.email
            ?.trim()
            ?.toLowerCase();

    console.log(currentUserEmail);
    console.log(superAdminEmails);

    const isSuperAdmin =
        superAdminEmails.includes(
            currentUserEmail
        );

    if (!isSuperAdmin) {

        throw new ApiError(
            403,
            "only super admin can perform this action"
        );
    }

    return {

        role:
            HARD_CODED_SUPER_ADMIN_ROLE,

        email:
            req.staff.email
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
                    <p>&copy; 2026 DelhiChaska. All rights reserved.</p>
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

// CONTROLLER

const startEmployeeRegistration = asynchandler(async (req, res) => {

  const {
    name,
    email,
    phone,
    password,
    role,
    profile_image,
    assignedArea
  } = req.body;

  // ✅ Validation
  if (
    [
      name,
      email,
      phone,
      password,
      role,
      assignedArea
    ].some(
      (field) =>
        !field || field.toString().trim() === ""
    )
  ) {
    throw new ApiError(
      400,
      "name, email, phone, password, role and assignedArea are required"
    );
  }

  // ✅ Existing employee check
  const existingEmployee = await Employee.findOne({
    $or: [{ email }, { phone }]
  });

  if (existingEmployee) {
    throw new ApiError(409, "employee already exists");
  }

  // ✅ Existing temp employee check
  const existingTempEmployee = await TempEmployee.findOne({
    $or: [{ email }, { phone }]
  });

  if (existingTempEmployee) { 
    throw new ApiError(
      409,
      "employee registration is already pending for verification"
    );
  }

  // ✅ Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // ✅ Create temp employee
  const tempEmployee = await TempEmployee.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    password: hashedPassword,
    role,
    status: "not_verified",
    assignedArea: assignedArea.trim().toLowerCase(),
    profile_image: profile_image || ""
  });

  // ✅ Send notification emails
  let emailStatus = "emails sent successfully";

  // Admin notification
  sendEmployeeRegistrationNotification(
    name,
    email,
    role
  ).catch((error) => {
    console.log(
      "Failed to send admin notification:",
      error.message
    );

    emailStatus =
      "registration successful, but admin notification failed";
  });

  // Employee confirmation
  sendEmployeeSubmissionConfirmation(
    name,
    email
  ).catch((error) => {
    console.log(
      "Failed to send employee confirmation:",
      error.message
    );

    emailStatus =
      "registration successful, but employee confirmation failed";
  });

  // ✅ Response
  return res.status(201).json(
    new ApiResponse(
      201,
      {
        id: tempEmployee._id,
        name: tempEmployee.name,
        email: tempEmployee.email,
        role: tempEmployee.role,
        status: tempEmployee.status,
        assignedArea: tempEmployee.assignedArea,
        createdAt: tempEmployee.createdAt
      },
      `employee registration submitted successfully! ${emailStatus}`
    )
  );
});

 

const loginStaff = asynchandler(async (req, res) => {

    const { email, password } = req.body;

    const api = req.headers.apikey;
    // console.log(api);

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



const logoutStaff = asynchandler(async (req, res) => {

    // ==========================
    // 🔐 Get Logged-in User
    // ==========================
    const staffId = req.staff?._id;

    if (!staffId) {
        throw new ApiError(401, "Unauthorized request");
    }

    // ==========================
    // 🧹 Remove Refresh Token from DB
    // ==========================
    await Employee.findByIdAndUpdate(
        staffId,
        {
            $unset: { refreshToken: 1 } // removes field
        },
        { new: true }
    );

    // ==========================
    // 🍪 Cookie Options (same as login)
    // ==========================
    const options = {
        httpOnly: true,
        secure: false,
    };

    // ==========================
    // 🚪 Clear Cookies
    // ==========================
    return res
        .status(200)
        .clearCookie("accesstoken", options)
        .clearCookie("refreshtoken", options)
        .json(
            new ApiResponse(
                200,
                {},
                "staff logged out successfully"
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
console.log(tempEmployee.assignedArea);

    const employee = new Employee({
        name: tempEmployee.name,
        email: tempEmployee.email,
        phone: tempEmployee.phone,
        password: tempEmployee.password,
        role: tempEmployee.role,

        // ✅ ADDED
        assignedArea: tempEmployee.assignedArea,

        status: "verified",
        profile_image: tempEmployee.profile_image
    });

    employee.$__.activePaths.clear("modify");

    await employee.save();

    await TempEmployee.findByIdAndDelete(tempEmployeeId);

    // Send approval notification email to employee (non-blocking)
    let emailStatus = "approval notification sent successfully";

    sendEmployeeApprovalNotification(
        tempEmployee.name,
        tempEmployee.email,
        tempEmployee.role
    ).catch(error => {
        console.log("Failed to send approval email:", error.message);

        emailStatus =
        "employee verified, but approval notification failed";
    });

    return res
    .status(201)
    .json(
        new ApiResponse(
            201,
            employee,
            `employee verified and registered successfully! ${emailStatus}`
        )
    );
});






const editEmployeeDetails = asynchandler(async (req, res) => {

    // ─────────────────────────────────────────────
    // ONLY SUPER ADMIN
    // ─────────────────────────────────────────────
    ensureSuperAdmin(req);

    // ─────────────────────────────────────────────
    // PARAMS
    // ─────────────────────────────────────────────
    const { employeeId } = req.params;

    // ─────────────────────────────────────────────
    // BODY
    // ─────────────────────────────────────────────
    const {
        name,
        email,
        password
    } = req.body;

    if (!employeeId) {

        throw new ApiError(
            400,
            "Employee ID is required"
        );
    }

    // ─────────────────────────────────────────────
    // FIND EMPLOYEE
    // ─────────────────────────────────────────────
    const employee =
        await Employee.findById(employeeId);

    console.log(employee);

    if (!employee) {

        throw new ApiError(
            404,
            "Employee not found"
        );
    }

    // ─────────────────────────────────────────────
    // CHECK EMAIL DUPLICATE
    // ─────────────────────────────────────────────
    if (
        email &&
        email.toLowerCase() !==
        employee.email.toLowerCase()
    ) {

        const existingEmployee =
            await Employee.findOne({
                email: email.toLowerCase()
            });

        if (existingEmployee) {

            throw new ApiError(
                409,
                "Email already in use"
            );
        }
    }

    // ─────────────────────────────────────────────
    // UPDATE NAME
    // ─────────────────────────────────────────────
    if (name) {

        employee.name = name;
    }

    // ─────────────────────────────────────────────
    // UPDATE EMAIL
    // ─────────────────────────────────────────────
    if (email) {

        employee.email =
            email.toLowerCase();
    }

    // ─────────────────────────────────────────────
    // UPDATE PASSWORD
    // HASH + COMPARE
    // ─────────────────────────────────────────────
    if (password) {

        // // compare old password with new password
        // const isSamePassword =
        //     await bcrypt.compare(
        //         password,
        //         employee.password
        //     );

        // if (isSamePassword) {

        //     throw new ApiError(
        //         400,
        //         "New password cannot be same as old password"
        //     );
        // }

        // hash new password
        const hashedPassword =
            await bcrypt.hash(
                password,
                10
            );

        employee.password =
            hashedPassword;
    }

    // ─────────────────────────────────────────────
    // SAVE
    // ─────────────────────────────────────────────
    await employee.save();

    // ─────────────────────────────────────────────
    // RESPONSE
    // ─────────────────────────────────────────────
    return res.status(200).json(

        new ApiResponse(
            200,
            {
                employeeId:
                    employee._id,

                name:
                    employee.name,

                email:
                    employee.email,

                role:
                    employee.role
            },

            "Employee details updated successfully"
        )
    );
});





const getEmployeesByRole = asynchandler(async (req, res) => {

    ensureSuperAdmin(req);

    const {
        role,
        assignedArea,
        page = 1,
        limit = 20
    } = req.query;

    let filter = {};

    // ✅ Role filter
    if (role) {
        filter.role = role;
    }

    // ✅ Assigned area filter
    if (assignedArea) {
        filter.assignedArea = assignedArea.toLowerCase();
    }

    const skip =
        (parseInt(page) - 1) * parseInt(limit);

    // ✅ Fetch employees
    const employees = await Employee.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    // ✅ Count
    const totalEmployees =
        await Employee.countDocuments(filter);

    const totalPages = Math.ceil(
        totalEmployees / parseInt(limit)
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                employees,

                appliedFilters: {
                    role: role || null,
                    assignedArea:
                        assignedArea || null
                },

                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalEmployees,
                    hasNextPage:
                        parseInt(page) < totalPages,
                    hasPrevPage:
                        parseInt(page) > 1
                }
            },
            "Employees fetched successfully"
        )
    );
});















const deleteAllOrders = asynchandler(async (req, res) => {
ensureSuperAdmin(req);
  // delete all orders
  const deletedOrders = await Order.deleteMany({});

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        deletedCount: deletedOrders.deletedCount
      },
      "All orders deleted successfully"
    )
  );

});















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
    paymentRequested: order.paymentRequested,

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



const AREA_CITY_MAP = {
  bay_area: [

  // San Francisco Bay Area
  "San Francisco",
  "San Jose",
  "Oakland",
  "Berkeley",
  "Palo Alto",
  "Fremont",
  "Santa Clara",
  "Sunnyvale",
  "Mountain View",
  "Cupertino",
  "Milpitas",
  "Hayward",
  "Union City",
  "Daly City",
  "San Mateo",
  "Redwood City",
  "South San Francisco",
  "Menlo Park",
  "Los Altos",
  "Campbell",
  "Saratoga",
  "Morgan Hill",
  "Gilroy",
  "Pleasanton",
  "Livermore",
  "Walnut Creek",
  "Concord",
  "Richmond",
  "Alameda",
  "San Leandro",
  "Pittsburg",
  "Antioch",
  "Novato",
  "Napa",
  "Sonoma",
  "Vallejo",
  "Fairfield",
  "Vacaville",
  "Benicia",
  "Martinez",
  "California"

],

seattle: [

  // Greater Seattle Area
  "Seattle",
  "Bellevue",
  "Redmond",
  "Tacoma",
  "Everett",
  "Kirkland",
  "Renton",
  "Kent",
  "Auburn",
  "Federal Way",
  "Shoreline",
  "Bothell",
  "Issaquah",
  "Sammamish",
  "Lynnwood",
  "Edmonds",
  "Mukilteo",
  "Bremerton",
  "Lakewood",
  "Puyallup",
  "Marysville",
  "Monroe",
  "Woodinville",
  "Mercer Island",
  "Burien",
  "Des Moines",
  "SeaTac",
  "Tukwila",
  "Olympia",
  "Washington"

],
};

const adminViewOrdersByArea = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────────
  ensureSuperAdmin(req);

  const {

    area,

    // OPTIONAL FILTERS
    status,
    paymentStatus,

    // DATE FILTERS
    date,
    startDate,
    endDate,

    page = 1,
    limit = 10

  } = req.query;

  // ─────────────────────────────────────────────
  // AREA REQUIRED
  // ─────────────────────────────────────────────
  if (!area) {

    throw new ApiError(
      400,
      "Area is required"
    );
  }

  // ─────────────────────────────────────────────
  // GET AREA CITIES
  // ─────────────────────────────────────────────
  const cities =
    AREA_CITY_MAP[
      area.toLowerCase()
    ];

  if (!cities) {

    throw new ApiError(
      400,
      "Invalid area provided"
    );
  }

  // ─────────────────────────────────────────────
  // BASE FILTER
  // ─────────────────────────────────────────────
  const filter = {

    $expr: {
      $in: [
        {
          $toLower:
            "$deliveryDetails.city"
        },
        cities.map(
          city =>
            city.toLowerCase()
        )
      ]
    }
  };

  // ─────────────────────────────────────────────
  // STATUS FILTER
  // ─────────────────────────────────────────────
  if (status) {

    filter.status = status;
  }

  // ─────────────────────────────────────────────
  // PAYMENT STATUS
  // ─────────────────────────────────────────────
  if (paymentStatus) {

    filter["payment.status"] =
      paymentStatus;
  }

  // ─────────────────────────────────────────────
  // SINGLE DATE FILTER
  // ─────────────────────────────────────────────
  if (date) {

    const selectedDate =
      new Date(date);

    const startOfDay =
      new Date(selectedDate);

    startOfDay.setHours(
      0,
      0,
      0,
      0
    );

    const endOfDay =
      new Date(selectedDate);

    endOfDay.setHours(
      23,
      59,
      59,
      999
    );

    filter.createdAt = {

      $gte: startOfDay,

      $lte: endOfDay
    };
  }

  // ─────────────────────────────────────────────
  // DATE RANGE FILTER
  // ─────────────────────────────────────────────
  if (startDate || endDate) {

    filter.createdAt = {};

    if (startDate) {

      filter.createdAt.$gte =
        new Date(startDate);
    }

    if (endDate) {

      const end =
        new Date(endDate);

      end.setHours(
        23,
        59,
        59,
        999
      );

      filter.createdAt.$lte =
        end;
    }
  }

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 10;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const [orders, totalOrders] =

    await Promise.all([

      Order.find(filter)

        .populate(
          "userId",
          "full_name email phone_number username"
        )

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      Order.countDocuments(
        filter
      )
    ]);

  // ─────────────────────────────────────────────
  // FORMAT ORDERS
  // ─────────────────────────────────────────────
  const formattedOrders =

    orders.map(order => {

      // =====================================================
      // FORMAT ITEMS
      // =====================================================
      const formattedItems =

        order.items.map(item => {

          const price =

            item.selectedVariant?.price || 0;

          const size =

            item.selectedVariant?.size || "";

          const subtotal =

            item.subtotal ||

            (
              price *
              item.quantity
            );

          // =================================================
          // COMBO ITEM
          // =================================================
          if (
            item.type === "combo"
          ) {

            return {

              comboId:
                item.comboId || null,

              name:
                item.name || "",

              quantity:
                item.quantity || 0,

              type:
                item.type || "",

              // ✅ VARIANT
              variant: {

                size,

                price
              },

              // ✅ COMBO SELECTIONS
              selections:

                item.selections?.map(sel => ({

                  ruleId:
                    sel.ruleId || null,

                  products:

                    sel.products?.map(prod => ({

                      productId:
                        prod.productId || null,

                      name:
                        prod.name || "",

                      category:
                        prod.category || "",

                      quantity:
                        prod.quantity || 0
                    })) || []

                })) || [],

              subtotal
            };
          }

          // =================================================
          // NORMAL PRODUCT
          // =================================================
          return {

            productId:
              item.productId || null,

            comboId:
              item.comboId || null,

            name:
              item.name || "",

            quantity:
              item.quantity || 0,

            type:
              item.type || "",

            // ✅ VARIANT
            variant: {

              size,

              price
            },

            subtotal
          };
        });

      // =====================================================
      // RETURN ORDER
      // =====================================================
      return {

        orderId:
          order._id,

        user: {

          userId:
            order.userId?._id,

          name:
            order.userId?.full_name || "",

          username:
            order.userId?.username || "",

          email:
            order.userId?.email || "",

          phone:
            order.userId?.phone_number || ""
        },

        status:
          order.status,

        payment: {

          method:
            order.payment?.method || "",

          status:
            order.payment?.status || ""
        },

        paymentRequested:
          order.paymentRequested || false,

        totalAmount:
          order.totalAmount || 0,

        deliveryDate:
          order.deliveryDate || null,

        deliveredAt:
          order.deliveredAt || null,

        isorderdelivered:
          order.isorderdelivered || false,

        deliveryProofImage:
          order.deliveryProofImage || null,

        itemCount:
          formattedItems.length,

        items:
          formattedItems,

        deliveryDetails:
          order.deliveryDetails || {},

        placedAt:
          order.createdAt
      };
    });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        area,

        citiesCovered:
          cities,

        filters: {

          status:
            status || null,

          paymentStatus:
            paymentStatus || null,

          date:
            date || null,

          startDate:
            startDate || null,

          endDate:
            endDate || null
        },

        orders:
          formattedOrders,

        pagination: {

          totalOrders,

          currentPage,

          totalPages:
            Math.ceil(
              totalOrders / perPage
            ),

          limit:
            perPage
        }
      },

      "Orders fetched successfully by area"
    )
  );
});

// ─────────────────────────────────────────────
// 🔄 UPDATE ORDER STATUS (Admin)  → sends mail
// ─────────────────────────────────────────────

const adminUpdateOrderStatus = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS
  // ─────────────────────────────────────────────
  const { orderId } = req.params;

  const { status } = req.body;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  const allowedStatuses = [
    "confirmed",
    "preparing",
    "out_for_delivery",
    "delivered",
    "cancelled"
  ];

  if (
    !status ||
    !allowedStatuses.includes(status)
  ) {
    throw new ApiError(
      400,
      `Invalid status. Allowed: ${allowedStatuses.join(", ")}`
    );
  }

  // ─────────────────────────────────────────────
  // FIND ORDER
  // ─────────────────────────────────────────────
  const order = await Order.findById(orderId)
    .populate("userId", "full_name email");

  if (!order) {
    throw new ApiError(
      404,
      "Order not found"
    );
  }

  // ─────────────────────────────────────────────
  // PREVENT UPDATES
  // ─────────────────────────────────────────────
  if (
    order.status === "delivered"
  ) {
    throw new ApiError(
      400,
      `Cannot update a ${order.status} order`
    );
  }

  // ─────────────────────────────────────────────
  // UPDATE STATUS
  // ─────────────────────────────────────────────
  order.status = status;

  // ✅ SET DELIVERED TIME
  if (status === "delivered") {
    order.deliveredAt = new Date();
  }

  // ✅ RESET PAYMENT REQUEST
  if (
    status === "confirmed" &&
    order.paymentRequested
  ) {
    order.paymentRequested = false;
  }

  await order.save();

  // ─────────────────────────────────────────────
  // SEND EMAIL TO USER
  // ─────────────────────────────────────────────
  if (order.userId?.email) {

    await sendEmail({

      to: order.userId.email,

      subject: `Order Status Updated - ${status}`,

      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">

          <h2>
            Your Order Status Has Been Updated
          </h2>

          <p>
            Hello ${order.userId.full_name || "Customer"},
          </p>

          <p>
            Your order status has been updated successfully.
          </p>

          <hr />

          <p>
            <strong>Order ID:</strong>
            ${order._id}
          </p>

          <p>
            <strong>New Status:</strong>
            ${status}
          </p>

          <p>
            <strong>Total Amount:</strong>
            $${order.totalAmount}
          </p>

          ${
            order.deliveredAt
              ? `
                <p>
                  <strong>Delivered At:</strong>
                  ${new Date(order.deliveredAt).toLocaleString()}
                </p>
              `
              : ""
          }

          <hr />

          <p>
            Thank you for ordering with us ❤️
          </p>

        </div>
      `
    });
  }

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        orderId: order._id,

        previousStatus: order.status,

        newStatus: status,

        deliveredAt:
          order.deliveredAt || null,

        paymentRequested:
          order.paymentRequested || false
      },
      `Order status updated to "${status}" successfully`
    )
  );
});

// ─────────────────────────────────────────────
// 💳 UPDATE PAYMENT STATUS (Admin)
// ─────────────────────────────────────────────

const adminUpdatePaymentStatus = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS
  // ─────────────────────────────────────────────
  const { orderId } = req.params;

  const { paymentStatus } = req.body;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  const allowedPaymentStatuses = [
    "pending",
    "paid",
    "failed"
  ];

  if (
    !paymentStatus ||
    !allowedPaymentStatuses.includes(paymentStatus)
  ) {
    throw new ApiError(
      400,
      `Invalid payment status. Allowed: ${allowedPaymentStatuses.join(", ")}`
    );
  }

  // ─────────────────────────────────────────────
  // FIND ORDER
  // ─────────────────────────────────────────────
  const order = await Order.findById(orderId)
    .populate("userId", "full_name email");

  if (!order) {
    throw new ApiError(
      404,
      "Order not found"
    );
  }

  // ─────────────────────────────────────────────
  // UPDATE PAYMENT STATUS
  // ─────────────────────────────────────────────
  order.payment.status = paymentStatus;

  // ✅ RESET PAYMENT REQUEST
  // AFTER PAYMENT APPROVED
  if (paymentStatus === "paid") {
    order.paymentRequested = false;
  }

  await order.save();

  // ─────────────────────────────────────────────
  // SEND EMAIL TO USER
  // ─────────────────────────────────────────────
  if (
    paymentStatus === "paid" &&
    order.userId?.email
  ) {

    await sendEmail({

      to: order.userId.email,

      subject: "Payment Approved Successfully",

      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">

          <h2>
            Payment Approved ✅
          </h2>

          <p>
            Hello ${order.userId.full_name || "Customer"},
          </p>

          <p>
            Your payment has been successfully verified and approved by admin.
          </p>

          <hr />

          <p>
            <strong>Order ID:</strong>
            ${order._id}
          </p>

          <p>
            <strong>Payment Status:</strong>
            ${paymentStatus}
          </p>

          <p>
            <strong>Total Amount:</strong>
            $${order.totalAmount}
          </p>

          <hr />

          <p>
            Thank you for ordering with us ❤️
          </p>

        </div>
      `
    });
  }

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        orderId: order._id,

        paymentRequested:
          order.paymentRequested || false,

        newPaymentStatus:
          order.payment.status
      },
      `Payment status updated to "${paymentStatus}"`
    )
  );
});








export const ensureKitchen = (req) => {

  // ❌ NO USER
  if (!req.staff) {
    throw new ApiError(
      401,
      "Unauthorized access"
    );
  } 
  console.log("Staff role:", req.staff.role);
  
  // ❌ NOT KITCHEN
  if ( req.staff.role !== "admin"  && req.staff.role !== "kitchen") {
    throw new ApiError(
      403,
      "Kitchen access only"
    );
  }

  return true;
};





// kitchen routes \   thisi th eprevious one 



const kitchenViewOrdersByArea = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────────
  ensureKitchen(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {
    area,
    page = 1,
    limit = 20
  } = req.query;

  // ─────────────────────────────────────────────
  // AREA REQUIRED
  // ─────────────────────────────────────────────
  if (!area) {

    throw new ApiError(
      400,
      "Area is required"
    );
  }

  // ─────────────────────────────────────────────
  // GET CITIES
  // ─────────────────────────────────────────────
  const cities =
    AREA_CITY_MAP[
      area.toLowerCase()
    ];

  if (!cities) {

    throw new ApiError(
      400,
      "Invalid area provided"
    );
  }

  // ─────────────────────────────────────────────
  // FILTER
  // ─────────────────────────────────────────────
  const filter = {

    status: "confirmed",

    isorderdelivered: false,

    $expr: {
      $in: [
        {
          $toLower:
            "$deliveryDetails.city"
        },
        cities.map(
          city =>
            city.toLowerCase()
        )
      ]
    }
  };

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 20;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const [orders, totalOrders] =

    await Promise.all([

      Order.find(filter)

        .populate(
          "userId",
          "username full_name"
        )

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      Order.countDocuments(filter)
    ]);

  // ─────────────────────────────────────────────
  // SIZE CONVERSION HELPER
  // ─────────────────────────────────────────────
  const convertTo16OzUnits = (
    size,
    quantity
  ) => {

    const normalizedSize =

      size
        ?.toString()
        .toLowerCase()
        .replace(/\s+/g, "");

    // 32oz = 2x 16oz
    if (
      normalizedSize === "32oz"
    ) {

      return quantity * 2;
    }

    // 16oz = 1x
    if (
      normalizedSize === "16oz"
    ) {

      return quantity;
    }

    // 8oz = 0.5x
    if (
      normalizedSize === "8oz"
    ) {

      return quantity * 0.5;
    }

    return quantity;
  };

  // ─────────────────────────────────────────────
  // AGGREGATED ITEMS
  // ─────────────────────────────────────────────
  const aggregatedItemsMap = {};

  orders.forEach(order => {

    order.items.forEach(item => {

      const size =

        item.selectedVariant?.size ||
        "default";

      // =====================================================
      // COMBO ITEMS → USE SELECTIONS
      // =====================================================
      if (
        item.type === "combo" &&
        item.selections?.length > 0
      ) {

        item.selections.forEach(selection => {

          selection.products?.forEach(product => {

            const productName =
              product.name || "Unknown";

            const category =
              product.category || "Others";

            const quantity =

              (
                product.quantity || 1
              ) *
              (
                item.quantity || 1
              );

            // =====================================================
            // CONVERT TO 16oz
            // =====================================================
            const equivalent16ozQty =

              convertTo16OzUnits(
                size,
                quantity
              );

            // =====================================================
            // UNIQUE KEY
            // =====================================================
            const key =
              productName
                .trim()
                .toLowerCase();

            // =====================================================
            // CREATE
            // =====================================================
            if (
              !aggregatedItemsMap[key]
            ) {

              aggregatedItemsMap[key] = {

                name:
                  productName,

                category,

                totalQuantity: 0,

                total16ozEquivalent: 0,

                variants: {}
              };
            }

            // =====================================================
            // TOTALS
            // =====================================================
            aggregatedItemsMap[
              key
            ].totalQuantity +=
              quantity;

            aggregatedItemsMap[
              key
            ].total16ozEquivalent +=
              equivalent16ozQty;

            // =====================================================
            // BREADS → NO VARIANTS
            // =====================================================
            if (
              category
                ?.toLowerCase() ===
              "breads"
            ) {

              return;
            }

            // =====================================================
            // VARIANTS
            // =====================================================
            if (
              !aggregatedItemsMap[
                key
              ].variants[size]
            ) {

              aggregatedItemsMap[
                key
              ].variants[size] = 0;
            }

            aggregatedItemsMap[
              key
            ].variants[size] +=
              quantity;

          });

        });

        return;
      }

      // =====================================================
      // NORMAL PRODUCTS
      // =====================================================
      const quantity =
        item.quantity || 0;

      const equivalent16ozQty =

        convertTo16OzUnits(
          size,
          quantity
        );

      // =====================================================
      // CATEGORY
      // =====================================================
      const category =

        item.category ||

        "Others";

      // =====================================================
      // UNIQUE KEY
      // =====================================================
      const key =
        item.name
          ?.trim()
          ?.toLowerCase();

      // =====================================================
      // CREATE
      // =====================================================
      if (
        !aggregatedItemsMap[key]
      ) {

        aggregatedItemsMap[key] = {

          name:
            item.name,

          category,

          totalQuantity: 0,

          total16ozEquivalent: 0,

          variants: {}
        };
      }

      // =====================================================
      // TOTALS
      // =====================================================
      aggregatedItemsMap[
        key
      ].totalQuantity +=
        quantity;

      aggregatedItemsMap[
        key
      ].total16ozEquivalent +=
        equivalent16ozQty;

      // =====================================================
      // BREADS → NO VARIANTS
      // =====================================================
      if (
        category
          ?.toLowerCase() ===
        "breads"
      ) {

        return;
      }

      // =====================================================
      // VARIANTS
      // =====================================================
      if (
        !aggregatedItemsMap[
          key
        ].variants[size]
      ) {

        aggregatedItemsMap[
          key
        ].variants[size] = 0;
      }

      aggregatedItemsMap[
        key
      ].variants[size] +=
        quantity;

    });

  });

  // ─────────────────────────────────────────────
  // FINAL AGGREGATED ITEMS
  // ─────────────────────────────────────────────
  const aggregatedItems =

    Object.values(
      aggregatedItemsMap
    );

  // ─────────────────────────────────────────────
  // FORMAT ORDERS
  // ─────────────────────────────────────────────
  const formattedOrders =

    orders.map(order => ({

      orderId:
        order._id,

      username:
        order.userId?.username ||

        order.userId?.full_name ||

        "Unknown",

      status:
        order.status,

      itemCount:
        order.items.length,

      items:
        order.items.map(item => ({

          name:
            item.name,

          quantity:
            item.quantity,

          type:
            item.type,

          variant: {

            size:
              item.selectedVariant?.size || "",

            price:
              item.selectedVariant?.price || 0
          },

          // ✅ COMBO SELECTIONS
          selections:

            item.type === "combo"

              ?

              item.selections?.map(sel => ({

                ruleId:
                  sel.ruleId || null,

                products:

                  sel.products?.map(prod => ({

                    productId:
                      prod.productId || null,

                    name:
                      prod.name || "",

                    category:
                      prod.category || "",

                    quantity:
                      prod.quantity || 0
                  })) || []

              })) || []

              : [],

          subtotal:
            item.subtotal || 0
        })),

      placedAt:
        order.createdAt
    }));

  // ─────────────────────────────────────────────
  // GROUP ORDERS BY USERNAME
  // ─────────────────────────────────────────────
  const groupedOrdersMap = {};

  formattedOrders.forEach(order => {

    const username =
      order.username || "Unknown";

    // =====================================================
    // CREATE GROUP
    // =====================================================
    if (
      !groupedOrdersMap[username]
    ) {

      groupedOrdersMap[
        username
      ] = {

        username,

        totalOrders: 0,

        orders: []
      };
    }

    // =====================================================
    // PUSH ORDER
    // =====================================================
    groupedOrdersMap[
      username
    ].orders.push(order);

    groupedOrdersMap[
      username
    ].totalOrders += 1;
  });

  // ─────────────────────────────────────────────
  // FINAL GROUPED ORDERS
  // ─────────────────────────────────────────────
  const groupedOrders =

    Object.values(
      groupedOrdersMap
    );

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        area,

        citiesCovered:
          cities,

        // ✅ USER GROUPED ORDERS
        orders:
          groupedOrders,

        // ✅ CONSOLIDATED KITCHEN SUMMARY
        aggregatedItems,

        pagination: {

          totalOrders,

          currentPage,

          totalPages:
            Math.ceil(
              totalOrders / perPage
            ),

          limit:
            perPage
        }
      },

      "Kitchen orders fetched successfully"
    )
  );
});















// const getAllDrivers = asynchandler(async (req, res) => {

//   // ─────────────────────────────────────────────
//   // QUERY PARAMS
//   // ─────────────────────────────────────────────
//   const {
//     isDriverAvailable,
//     assignedArea,
//     search,
//     page = 1,
//     limit = 10
//   } = req.query;

//   // ─────────────────────────────────────────────
//   // BASE FILTER
//   // ─────────────────────────────────────────────
//   const filter = {
//     role: "driver"
//   };

//   // ─────────────────────────────────────────────
//   // APPLY FILTERS ONLY FOR ADMIN
//   // ─────────────────────────────────────────────
//   if (req.staff?.role === "admin") {

//     // ✅ DRIVER AVAILABILITY
//     if (
//       typeof isDriverAvailable !==
//       "undefined"
//     ) {

//       filter.isDriverAvailable =
//         isDriverAvailable === "true";
//     }

//     // ✅ ASSIGNED AREA
//     if (assignedArea) {

//       filter.assignedArea = {
//         $regex: assignedArea,
//         $options: "i"
//       };
//     }

//     // ✅ SEARCH
//     if (search) {

//       filter.$or = [

//         {
//           name: {
//             $regex: search,
//             $options: "i"
//           }
//         },

//         {
//           email: {
//             $regex: search,
//             $options: "i"
//           }
//         },

//         {
//           phone: {
//             $regex: search,
//             $options: "i"
//           }
//         }

//       ];
//     }
//   }

//   // ─────────────────────────────────────────────
//   // PAGINATION
//   // ─────────────────────────────────────────────
//   const currentPage =
//     Number(page) || 1;

//   const perPage =
//     Number(limit) || 10;

//   const skip =
//     (currentPage - 1) * perPage;

//   // ─────────────────────────────────────────────
//   // FETCH DRIVERS
//   // ─────────────────────────────────────────────
//   const [drivers, totalDrivers] =
//     await Promise.all([

//       Employee.find(filter)

//         .select("-password -refreshToken")

//         .sort({
//           createdAt: -1
//         })

//         .skip(skip)

//         .limit(perPage)

//         .lean(),

//       Employee.countDocuments(filter)
//     ]);

//   // ─────────────────────────────────────────────
//   // FORMAT DRIVERS
//   // ─────────────────────────────────────────────
//   const formattedDrivers =
//     drivers.map(driver => ({

//       driverId:
//         driver._id,

//       name:
//         driver.name || "",

//       username:
//         driver.username || "",

//       email:
//         driver.email || "",

//       phone:
//         driver.phone || "",

//       role:
//         driver.role,

//       assignedArea:
//         driver.assignedArea || null,

//       isDriverAvailable:
//         driver.isDriverAvailable || false,

//       status:
//         driver.status,

//       profile_image:
//         driver.profile_image || "",

//       createdAt:
//         driver.createdAt
//     }));

//   // ─────────────────────────────────────────────
//   // RESPONSE
//   // ─────────────────────────────────────────────
//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       {

//         filters:
//           req.staff?.role === "admin"
//             ? {
//                 isDriverAvailable:
//                   typeof isDriverAvailable !==
//                   "undefined"
//                     ? isDriverAvailable ===
//                       "true"
//                     : null,

//                 assignedArea:
//                   assignedArea || null,

//                 search:
//                   search || null
//               }
//             : null,

//         drivers:
//           formattedDrivers,

//         pagination: {

//           totalDrivers,

//           currentPage,

//           totalPages:
//             Math.ceil(
//               totalDrivers / perPage
//             ),

//           limit:
//             perPage
//         }

//       },
//       "Drivers fetched successfully"
//     )
//   );
// });



//
// ─────────────────────────────────────────────
// GET ALL EMPLOYEES
// ─────────────────────────────────────────────
//
const getAllDrivers = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {
    status,
    assignedArea,
    isDriverAvailable,
    search,
    upForNextDelivery,
    page = 1,
    limit = 10
  } = req.query;

  // ─────────────────────────────────────────────
  // BASE FILTER
  // ─────────────────────────────────────────────
  const filter = {
    role: "driver"
  };

  // ─────────────────────────────────────────────
  // STATUS FILTER
  // Example:
  // ?status=verified
  // ─────────────────────────────────────────────
  if (
    typeof status === "string" &&
    status.trim() !== ""
  ) {

    filter.status =
      status.trim().toLowerCase();
  }

  // ─────────────────────────────────────────────
  // UP FOR NEXT DELIVERY FILTER
  // Example:
  // ?upForNextDelivery=true
  // ─────────────────────────────────────────────
  if (
    typeof upForNextDelivery === "string"
  ) {

    const upForNextDeliveryValue =
      upForNextDelivery
        .trim()
        .toLowerCase();

    if (
      upForNextDeliveryValue === "true" ||
      upForNextDeliveryValue === "false"
    ) {

      filter.upForNextDelivery =
        upForNextDeliveryValue === "true";
    }
  }

  // ─────────────────────────────────────────────
  // ASSIGNED AREA FILTER
  // Example:
  // ?assignedArea=seattle
  // ─────────────────────────────────────────────
  if (
    typeof assignedArea ===
      "string" &&
    assignedArea.trim() !== ""
  ) {

    filter.assignedArea = {
      $regex:
        assignedArea.trim(),
      $options: "i"
    };
  }

  // ─────────────────────────────────────────────
  // DRIVER AVAILABILITY FILTER
  // Example:
  // ?isDriverAvailable=false
  // ─────────────────────────────────────────────
  if (
    typeof isDriverAvailable ===
    "string"
  ) {

    const availability =
      isDriverAvailable
        .trim()
        .toLowerCase();

    if (
      availability === "true" ||
      availability === "false"
    ) {

      filter.isDriverAvailable =
        availability === "true";
    }
  }

  // ─────────────────────────────────────────────
  // SEARCH FILTER
  // Example:
  // ?search=driver1
  // ─────────────────────────────────────────────
  if (
    typeof search === "string" &&
    search.trim() !== ""
  ) {

    filter.$or = [

      {
        name: {
          $regex: search.trim(),
          $options: "i"
        }
      },

      {
        username: {
          $regex: search.trim(),
          $options: "i"
        }
      },

      {
        email: {
          $regex: search.trim(),
          $options: "i"
        }
      },

      {
        phone: {
          $regex: search.trim(),
          $options: "i"
        }
      }

    ];
  }



  // ✅ DEBUG
  console.log(filter);

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 10;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH DRIVERS
  // ─────────────────────────────────────────────
  const [drivers, totalDrivers] =
    await Promise.all([

      Employee.find(filter)

        .select(
          "-password -refreshToken"
        )

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      Employee.countDocuments(filter)
    ]);

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedDrivers =
    drivers.map(driver => ({

      employeeId:
        driver._id,

      name:
        driver.name || "",

      username:
        driver.username || "",

      email:
        driver.email || "",

      phone:
        driver.phone || "",

      role:
        driver.role,

      assignedArea:
        driver.assignedArea || null,

      isDriverAvailable:
        driver.isDriverAvailable,

      upForNextDelivery:
        driver.upForNextDelivery || false,
      nextDeliveryDate:
        driver.nextDeliveryDate || null,
      status:
        driver.status,

      profile_image:
        driver.profile_image || "",

      createdAt:
        driver.createdAt
    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {

        filters: {

          status:
            status || null,

          assignedArea:
            assignedArea || null,

          isDriverAvailable:
            typeof isDriverAvailable ===
            "string"
              ? isDriverAvailable
                  .trim()
                  .toLowerCase() ===
                "true"
              : null,

          search:
            search || null
        },

        totalDrivers,

        drivers:
          formattedDrivers,

        pagination: {

          currentPage,

          totalPages:
            Math.ceil(
              totalDrivers / perPage
            ),

          limit:
            perPage
        }

      },

      "Drivers fetched successfully"
    )
  );
});
//
// ─────────────────────────────────────────────
// ASSIGN AREA TO DRIVER
// ─────────────────────────────────────────────
//
const assignAreaToDriver = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // BODY
  // ─────────────────────────────────────────────
  const {
    employeeId,
    assignedArea,
    action // add | remove
  } = req.body;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  if (!employeeId) {
    throw new ApiError(
      400,
      "Employee ID is required"
    );
  }

  if (!action) {
    throw new ApiError(
      400,
      "Action is required"
    );
  }

  if (
    !["add", "remove"]
      .includes(action)
  ) {
    throw new ApiError(
      400,
      "Action must be add or remove"
    );
  }

  // ─────────────────────────────────────────────
  // FIND EMPLOYEE
  // ─────────────────────────────────────────────
  const employee =
    await Employee.findById(
      employeeId
    );

  if (!employee) {
    throw new ApiError(
      404,
      "Employee not found"
    );
  }

  // ─────────────────────────────────────────────
  // DRIVER CHECK
  // ─────────────────────────────────────────────
  if (
    employee.role !== "driver"
  ) {
    throw new ApiError(
      400,
      "Only drivers can have assigned areas"
    );
  }

  // ─────────────────────────────────────────────
  // ADD AREA
  // ─────────────────────────────────────────────
  if (action === "add") {

    if (!assignedArea) {
      throw new ApiError(
        400,
        "Assigned area is required"
      );
    }

    employee.assignedArea =
      assignedArea.toLowerCase();

    // ✅ DRIVER BUSY
    employee.isDriverAvailable =
      false;
  }

  // ─────────────────────────────────────────────
  // REMOVE AREA
  // ─────────────────────────────────────────────
  if (action === "remove") {

    // ✅ REMOVE AREA
    employee.assignedArea =
      null;

    // ✅ DRIVER AVAILABLE AGAIN
    employee.isDriverAvailable =
      true;
  }

  // ─────────────────────────────────────────────
  // SAVE
  // ─────────────────────────────────────────────
  await employee.save();

  // ─────────────────────────────────────────────
  // RESPONSE MESSAGE
  // ─────────────────────────────────────────────
  const message =
    action === "add"
      ? "Area assigned successfully"
      : "Area removed successfully";

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {

        employeeId:
          employee._id,

        name:
          employee.name,

        role:
          employee.role,

        assignedArea:
          employee.assignedArea,

        isDriverAvailable:
          employee.isDriverAvailable
      },
      message
    )
  );
});

const getUnverifiedDrivers = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {
    search,
    page = 1,
    limit = 10
  } = req.query;

  // ─────────────────────────────────────────────
  // FILTER
  // ─────────────────────────────────────────────
  const filter = {

    role: "driver",

    // status: "not_verified"
  };

  // ✅ SEARCH FILTER
  if (search) {

    filter.$or = [

      {
        name: {
          $regex: search,
          $options: "i"
        }
      },

      {
        username: {
          $regex: search,
          $options: "i"
        }
      },

      {
        email: {
          $regex: search,
          $options: "i"
        }
      },

      {
        phone: {
          $regex: search,
          $options: "i"
        }
      }

    ];
  }

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 10;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH DRIVERS
  // ─────────────────────────────────────────────
  const [drivers, totalDrivers] =
    await Promise.all([

      Employee.find(filter)

        .select("-password -refreshToken")

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      Employee.countDocuments(filter)
    ]);

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedDrivers =
    drivers.map(driver => ({

      driverId:
        driver._id,

      name:
        driver.name || "",

      username:
        driver.username || "",

      email:
        driver.email || "",

      phone:
        driver.phone || "",

      role:
        driver.role,

      assignedArea:
        driver.assignedArea || null,

      isDriverAvailable:
        driver.isDriverAvailable || false,

      status:
        driver.status,

      profile_image:
        driver.profile_image || "",

      createdAt:
        driver.createdAt
    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {

        filters: {
          search:
            search || null
        },

        drivers:
          formattedDrivers,

        pagination: {

          totalDrivers,

          currentPage,

          totalPages:
            Math.ceil(
              totalDrivers / perPage
            ),

          limit:
            perPage
        }

      },
      "Unverified drivers fetched successfully"
    )
  );
});



// const assignAreaToDriver = asynchandler(async (req, res) => {

//   ensureSuperAdmin(req);

//   // ─────────────────────────────────────────────
//   // BODY
//   // ─────────────────────────────────────────────
//   const {
//     driverId,
//     area
//   } = req.body;

//   // ─────────────────────────────────────────────
//   // VALIDATION
//   // ─────────────────────────────────────────────
//   if (!driverId) {
//     throw new ApiError(
//       400,
//       "Driver ID is required"
//     );
//   }

//   if (!area) {
//     throw new ApiError(
//       400,
//       "Area is required"
//     );
//   }

//   // ─────────────────────────────────────────────
//   // CHECK AREA
//   // ─────────────────────────────────────────────
//   const validArea =
//     AREA_CITY_MAP[
//       area.toLowerCase()
//     ];

//   if (!validArea) {
//     throw new ApiError(
//       400,
//       "Invalid area"
//     );
//   }

//   // ─────────────────────────────────────────────
//   // FIND DRIVER
//   // ─────────────────────────────────────────────
//   const driver =
//     await Staff.findById(driverId);

//   if (!driver) {
//     throw new ApiError(
//       404,
//       "Driver not found"
//     );
//   }

//   // ─────────────────────────────────────────────
//   // CHECK ROLE
//   // ─────────────────────────────────────────────
//   if (
//     driver.role !== "driver"
//   ) {
//     throw new ApiError(
//       400,
//       "Staff member is not a driver"
//     );
//   }

//   // ─────────────────────────────────────────────
//   // ASSIGN AREA
//   // ─────────────────────────────────────────────
//   driver.assignedArea =
//     area.toLowerCase();

//   await driver.save();

//   // ─────────────────────────────────────────────
//   // RESPONSE
//   // ─────────────────────────────────────────────
//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       {
//         driverId:
//           driver._id,

//         name:
//           driver.name,

//         role:
//           driver.role,

//         assignedArea:
//           driver.assignedArea
//       },
//       "Area assigned to driver successfully"
//     )
//   );
// });









const getAllUsers = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {
    search,
    gender,
    page = 1,
    limit = 10
  } = req.query;

  // ─────────────────────────────────────────────
  // FILTER
  // ─────────────────────────────────────────────
  const filter = {};

  // ✅ SEARCH
  if (search) {

    filter.$or = [

      {
        full_name: {
          $regex: search,
          $options: "i"
        }
      },

      {
        username: {
          $regex: search,
          $options: "i"
        }
      },

      {
        email: {
          $regex: search,
          $options: "i"
        }
      },

      {
        phone_number: {
          $regex: search,
          $options: "i"
        }
      }

    ];
  }

  // ✅ GENDER FILTER
  if (gender) {
    filter.gender = gender;
  }

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 10;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH USERS
  // ─────────────────────────────────────────────
  const [users, totalUsers] =
    await Promise.all([

      user.find(filter)

        .select(
          "-password -refreshToken -token"
        )

        .populate(
          "addresses"
        )

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      user.countDocuments(filter)
    ]);

  // ─────────────────────────────────────────────
  // FORMAT USERS
  // ─────────────────────────────────────────────
  const formattedUsers =
    users.map(singleUser => ({

      userId:
        singleUser._id,

      username:
        singleUser.username,

      full_name:
        singleUser.full_name,

      email:
        singleUser.email,

      phone_number:
        singleUser.phone_number,

      gender:
        singleUser.gender,

      DOB:
        singleUser.DOB,

      avatar:
        singleUser.avatar || "",

      is_email_verified:
        singleUser.is_email_verified,

      addresses:
        singleUser.addresses || [],

      createdAt:
        singleUser.createdAt

    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        filters: {
          search:
            search || null,
          gender:
            gender || null
        },

        users:
          formattedUsers,

        pagination: {
          totalUsers,

          currentPage,

          totalPages: Math.ceil(
            totalUsers / perPage
          ),

          limit: perPage
        }

      },
      "Users fetched successfully"
    )
  );
});










const getAllDriversfull = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {
    page = 1,
    limit = 10
  } = req.query;

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 10;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH DRIVERS ONLY
  // ─────────────────────────────────────────────
  const [drivers, totalDrivers] =
    await Promise.all([

      Employee.find({
        role: "driver"
      })

        .select(
          "-password -refreshToken"
        )

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      Employee.countDocuments({
        role: "driver"
      })
    ]);

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedDrivers =
    drivers.map(driver => ({

      employeeId:
        driver._id,

      name:
        driver.name || "",

      username:
        driver.username || "",

      email:
        driver.email || "",

      phone:
        driver.phone || "",

      role:
        driver.role,

      assignedArea:
        driver.assignedArea || null,

      isDriverAvailable:
        driver.isDriverAvailable || false,

      status:
        driver.status,

      upForNextDelivery:
        driver.upForNextDelivery || false,

      profile_image:
        driver.profile_image || "",

      createdAt:
        driver.createdAt
    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {

        totalDrivers,

        drivers:
          formattedDrivers,

        pagination: {

          currentPage,

          totalPages:
            Math.ceil(
              totalDrivers / perPage
            ),

          limit:
            perPage
        }

      },

      "Drivers fetched successfully"
    )
  );
});




const resetAllDrivers = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // RESET ALL DRIVERS
  // ─────────────────────────────────────────────
  const driverResult = await Employee.updateMany(
    { role: "driver" },
    {
      $set: {
        isDriverAvailable: true,
        upForNextDelivery: false,
        nextDeliveryDate: null,
        nextDeliveryNotes: "",
      },
    }
  );

  // ─────────────────────────────────────────────
  // GET ACTIVE BATCHES ONLY
  // EXCLUDE COMPLETED
  // ─────────────────────────────────────────────
  const activeBatches = await DeliveryBatch.find({
    driverId: { $ne: null },
    status: { $in: ["draft", "finalized", "in_delivery"] },
  }).select("_id driverId assignedToDriverHistory");

  // ─────────────────────────────────────────────
  // BULK UPDATE BATCHES
  // PRESERVE HISTORY + CLEAR ACTIVE DRIVER
  // ─────────────────────────────────────────────
  if (activeBatches.length) {

    const batchBulkOps = activeBatches.map((batch) => ({
      updateOne: {
        filter: { _id: batch._id },
        update: {
          $set: {
            // ✅ ONLY SET HISTORY IF NOT ALREADY SET
            ...(
              !batch.assignedToDriverHistory && {
                assignedToDriverHistory: batch.driverId,
              }
            ),
            driverId: null,
            viewToDriver: false,
          },
        },
      },
    }));

    await DeliveryBatch.bulkWrite(batchBulkOps);
  }

  // ─────────────────────────────────────────────
  // RESET ORDERS
  // ONLY NON-DELIVERED ORDERS
  // NEVER TOUCH DELIVERED HISTORY
  // ─────────────────────────────────────────────
  const orderResult = await Order.updateMany(
    {
      "deliveryAssignment.driverId": { $ne: null },
      status: { $nin: ["delivered", "cancelled"] },
    },
    {
      $set: {
        "deliveryAssignment.driverId": null,
      },
    }
  );

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        drivers: {
          matchedDrivers: driverResult.matchedCount,
          updatedDrivers: driverResult.modifiedCount,
        },
        batches: {
          totalProcessed: activeBatches.length,
          historyPreserved: true,
        },
        orders: {
          matchedOrders: orderResult.matchedCount,
          updatedOrders: orderResult.modifiedCount,
        },
      },
      "All drivers reset successfully while preserving batch and order history"
    )
  );
});








const deleteEmployee = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS
  // ─────────────────────────────────────────────
  const { employeeId } = req.params;

  if (!employeeId) {

    throw new ApiError(
      400,
      "Employee ID is required"
    );
  }

  // ─────────────────────────────────────────────
  // FIND EMPLOYEE
  // ─────────────────────────────────────────────
  const employee =
    await Employee.findById(employeeId);

  if (!employee) {

    throw new ApiError(
      404,
      "Employee not found"
    );
  }

  // ─────────────────────────────────────────────
  // PREVENT SELF DELETE
  // ─────────────────────────────────────────────
  if (
    req.staff?._id?.toString() ===
    employee._id.toString()
  ) {

    throw new ApiError(
      400,
      "You cannot delete yourself"
    );
  }

  // ─────────────────────────────────────────────
  // UNASSIGN DRIVER ORDERS
  // ─────────────────────────────────────────────
  await Order.updateMany(
    {
      "deliveryAssignment.driverId":
        employeeId
    },
    {
      $set: {
        "deliveryAssignment.batchId":
          null,

        "deliveryAssignment.driverId":
          null
      }
    }
  );

  // ─────────────────────────────────────────────
  // DELETE EMPLOYEE
  // ─────────────────────────────────────────────
  await Employee.findByIdAndDelete(
    employeeId
  );

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {
        employeeId:
          employee._id,

        name:
          employee.name,

        role:
          employee.role
      },

      "Employee deleted and orders unassigned successfully"
    )
  );
});















const getDeliveryBatchDetails = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  const { batchId } =
    req.params;

  const batch =
    await DeliveryBatch.findById(
      batchId
    )

    .populate(
      "driverId",
      "name phone"
    )

    .populate({
      path: "orders.orderId",

      populate: {
        path: "userId",
        select:
          "full_name phone_number username"
      }
    });

  if (!batch) {
    throw new ApiError(
      404,
      "Batch not found"
    );
  }

  const formattedOrders =
    batch.orders.map(item => {

      const order =
        item.orderId;

      return {

        sequence:
          item.sequence,

        orderId:
          order._id,

        customer: {

          name:
            order.userId?.full_name,

          phone:
            order.userId?.phone_number,

          username:
            order.userId?.username
        },

        address:
          order.deliveryDetails,

        latitude:
          order.deliveryDetails
            ?.location?.lat,

        longitude:
          order.deliveryDetails
            ?.location?.lng,

        totalAmount:
          order.totalAmount,

        status:
          order.status
      };
    });

  return res.status(200).json(

    new ApiResponse(
      200,
      {

        batchId:
          batch._id,

        driver:
          batch.driverId,

        status:
          batch.status,

        orders:
          formattedOrders
      },

      "Batch fetched successfully"
    )
  );
});



const createDeliveryBatch = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  const {
    driverId,
    orderIds,
    area
  } = req.body;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  if (!driverId) {

    throw new ApiError(
      400,
      "Driver ID required"
    );
  }

  if (
    !orderIds ||
    !Array.isArray(orderIds) ||
    orderIds.length === 0
  ) {

    throw new ApiError(
      400,
      "Orders required"
    );
  }

  // ─────────────────────────────────────────────
  // DRIVER
  // ─────────────────────────────────────────────
  const driver =
    await Employee.findById(driverId);

  if (
    !driver ||
    driver.role !== "driver"
  ) {

    throw new ApiError(
      404,
      "Driver not found"
    );
  }

  // ─────────────────────────────────────────────
  // CREATE BATCH
  // ─────────────────────────────────────────────
  const batch =
    await DeliveryBatch.create({

      driverId,

      area,

      // ✅ AUTO FINALIZED
      status: "draft",

      // ✅ DRIVER CANNOT SEE YET
      viewToDriver: false,

      orders:
        orderIds.map(
          (orderId, index) => ({

            orderId,

            sequence:
              index + 1
          })
        )
    });

  // ─────────────────────────────────────────────
  // ASSIGN ORDERS IMMEDIATELY
  // ─────────────────────────────────────────────
  for (
    let i = 0;
    i < orderIds.length;
    i++
  ) {

    await Order.findByIdAndUpdate(

      orderIds[i],

      {
        $set: {

          deliveryAssignment: {

            driverId,

            batchId: batch._id,

            deliverySequence:
              i + 1,

            assignedAt:
              new Date()
          }
        }
      }
    );
  }

  // ─────────────────────────────────────────────
  // FETCH UPDATED ORDERS
  // ─────────────────────────────────────────────
  const updatedOrders =
    await Order.find({

      _id: {
        $in: orderIds
      }

    })

      .populate(
        "userId",
        `
        username
        full_name
        email
        phone_number
        `
      )

      .lean();

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedOrders =
    updatedOrders.map(order => ({

      orderId:
        order._id,

      user: {

        userId:
          order.userId?._id,

        username:
          order.userId?.username || "",

        full_name:
          order.userId?.full_name || "",

        email:
          order.userId?.email || "",

        phone:
          order.userId?.phone_number || ""
      },

      deliverySequence:
        order.deliveryAssignment
          ?.deliverySequence || null
    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {
        batchId:
          batch._id,

        driver: {

          driverId:
            driver._id,

          name:
            driver.name,

          email:
            driver.email
        },

        area:
          batch.area,

        status:
          batch.status,

        viewToDriver:
          batch.viewToDriver,

        totalOrders:
          formattedOrders.length,

        orders:
          formattedOrders
      },

      "Orders assigned successfully"
    )
  );
});





const reorderDeliveryBatch = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS & BODY
  // ─────────────────────────────────────────────
  const { batchId } = req.params;
  const { orders } = req.body;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    throw new ApiError(400, "Orders array is required");
  }

  // ─────────────────────────────────────────────
  // FIND BATCH
  // ─────────────────────────────────────────────
  const batch = await DeliveryBatch.findById(batchId);

  if (!batch) {
    throw new ApiError(404, "Batch not found");
  }

  // ─────────────────────────────────────────────
  // GUARD: CANNOT REORDER ACTIVE/COMPLETED BATCH
  // ─────────────────────────────────────────────
  if (["in_delivery", "completed"].includes(batch.status)) {
    throw new ApiError(
      400,
      `Cannot reorder a batch that is already ${batch.status}`
    );
  }

  // ─────────────────────────────────────────────
  // VALIDATE: INCOMING IDS MUST MATCH BATCH ORDERS
  // PREVENT FOREIGN ORDER IDS BEING INJECTED
  // ─────────────────────────────────────────────
  const batchOrderIds = batch.orders.map((o) => o.orderId.toString());
  const incomingOrderIds = orders.map((o) => o.orderId.toString());

  const hasInvalidIds = incomingOrderIds.some(
    (id) => !batchOrderIds.includes(id)
  );

  if (hasInvalidIds) {
    throw new ApiError(
      400,
      "One or more order IDs do not belong to this batch"
    );
  }

  if (incomingOrderIds.length !== batchOrderIds.length) {
    throw new ApiError(
      400,
      "Reorder payload must include all orders in the batch"
    );
  }

  // ─────────────────────────────────────────────
  // NORMALIZE SEQUENCES
  // ENSURE 1-BASED CLEAN NUMBERING
  // ─────────────────────────────────────────────
  const normalizedOrders = orders
    .sort((a, b) => a.sequence - b.sequence)
    .map((o, i) => ({
      orderId: o.orderId,
      sequence: i + 1,
    }));

  // ─────────────────────────────────────────────
  // UPDATE BATCH ORDERS
  // ─────────────────────────────────────────────
  batch.orders = normalizedOrders;
  await batch.save();

  // ─────────────────────────────────────────────
  // BULK UPDATE ORDER SEQUENCES
  // ─────────────────────────────────────────────
  const bulkOps = normalizedOrders.map(({ orderId, sequence }) => ({
    updateOne: {
      filter: { _id: orderId },
      update: {
        $set: {
          "deliveryAssignment.deliverySequence": sequence,
          "deliveryAssignment.batchId": batch._id,
          "deliveryAssignment.driverId": batch.driverId,
        },
      },
    },
  }));

  await Order.bulkWrite(bulkOps);

  // ─────────────────────────────────────────────
  // FETCH UPDATED ORDERS WITH FULL DETAILS
  // ─────────────────────────────────────────────
  const updatedOrders = await Order.find({
    _id: { $in: incomingOrderIds },
  })
    .populate("userId", "username full_name email phone_number")
    .lean();

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // MAP SEQUENCE FROM normalizedOrders
  // THEN SORT BY SEQUENCE
  // ─────────────────────────────────────────────
  const sequenceMap = Object.fromEntries(
    normalizedOrders.map((o) => [o.orderId.toString(), o.sequence])
  );

  const formattedOrders = updatedOrders
    .map((order) => ({

      sequence: sequenceMap[order._id.toString()],

      orderId: order._id,

      status: order.status,

      totalAmount: order.totalAmount,

      user: {
        userId: order.userId?._id,
        username: order.userId?.username || "",
        full_name: order.userId?.full_name || "",
        email: order.userId?.email || "",
        phone: order.userId?.phone_number || "",
      },

      payment: {
        method: order.payment?.method || "",
        status: order.payment?.status || "",
      },

      deliveryDetails: {
        addressLine1: order.deliveryDetails?.addressLine1 || "",
        addressLine2: order.deliveryDetails?.addressLine2 || "",
        city: order.deliveryDetails?.city || "",
        state: order.deliveryDetails?.state || "",
        zipCode: order.deliveryDetails?.zipCode || "",
        country: order.deliveryDetails?.country || "",
        location: order.deliveryDetails?.location || null,
        phone: order.deliveryDetails?.phone || "",
        instructions: order.deliveryDetails?.instructions || "",
      },

      deliveryAssignment: {
        driverId: order.deliveryAssignment?.driverId || null,
        batchId: order.deliveryAssignment?.batchId || null,
        deliverySequence: sequenceMap[order._id.toString()],
        assignedAt: order.deliveryAssignment?.assignedAt || null,
      },

      placedAt: order.createdAt,
    }))
    .sort((a, b) => a.sequence - b.sequence);

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        batchId: batch._id,
        driverId: batch.driverId,
        area: batch.area,
        status: batch.status,
        viewToDriver: batch.viewToDriver,
        totalOrders: formattedOrders.length,
        orders: formattedOrders,
      },
      "Batch reordered successfully"
    )
  );
});


const finalizeDeliveryBatch = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS
  // ─────────────────────────────────────────────
  const { batchId } =
    req.params;

  // ─────────────────────────────────────────────
  // FIND BATCH
  // ─────────────────────────────────────────────
  const batch =
    await DeliveryBatch.findById(
      batchId
    );

  if (!batch) {

    throw new ApiError(
      404,
      "Batch not found"
    );
  }

  // ─────────────────────────────────────────────
  // SAVE DRIVER HISTORY IN BATCH
  // ONLY ON FINALIZATION
  // ─────────────────────────────────────────────
  batch.assignedToDriverHistory =
    batch.driverId;

  // ─────────────────────────────────────────────
  // FINALIZE BATCH
  // ─────────────────────────────────────────────
  batch.status =
    "finalized";

  batch.finalizedAt =
    new Date();

  // ✅ DRIVER CAN NOW SEE
  batch.viewToDriver =
    true;

  await batch.save();

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const batchOrderIds =
    batch.orders.map(
      item => item.orderId
    );

  const orders =
    await Order.find({

      _id: {
        $in: batchOrderIds
      }

    })

      .populate(
        "userId",
        `
        username
        full_name
        email
        phone_number
        `
      )

      .lean();

  // ─────────────────────────────────────────────
  // FORMAT ORDERS
  // ─────────────────────────────────────────────
  const formattedOrders =
    batch.orders.map(batchOrder => {

      const order =
        orders.find(
          o =>
            o._id.toString() ===
            batchOrder.orderId.toString()
        );

      return {

        orderId:
          order?._id,

        user: {

          userId:
            order?.userId?._id,

          username:
            order?.userId?.username || "",

          full_name:
            order?.userId?.full_name || "",

          email:
            order?.userId?.email || "",

          phone:
            order?.userId?.phone_number || ""
        },

        deliverySequence:
          batchOrder.sequence
      };
    });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {
        batchId:
          batch._id,

        // ✅ ACTIVE DRIVER
        driverId:
          batch.driverId,

        // ✅ HISTORY DRIVER
        assignedToDriverHistory:
          batch.assignedToDriverHistory,

        area:
          batch.area,

        status:
          batch.status,

        finalizedAt:
          batch.finalizedAt,

        viewToDriver:
          batch.viewToDriver,

        totalOrders:
          formattedOrders.length,

        orders:
          formattedOrders
      },

      "Batch finalized successfully"
    )
  );
});


const driverViewMyBatches = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // DRIVER ID
  // ─────────────────────────────────────────────
  const driverId =
    req.staff._id;

  // ─────────────────────────────────────────────
  // FETCH BATCHES
  // ONLY VISIBLE BATCHES
  // ─────────────────────────────────────────────
  const batches =
    await DeliveryBatch.find({

      driverId,

      // ✅ IMPORTANT
      viewToDriver: true,

      status: {

        $in: [
          "finalized",
          "in_delivery"
        ]
      }
    })

    // ✅ POPULATE ORDERS
    .populate({

      path:
        "orders.orderId",

      populate: {

        path:
          "userId",

        select:
          "username full_name phone_number"
      }
    })

    .sort({
      createdAt: -1
    });

  // ─────────────────────────────────────────────
  // EMPTY RESPONSE
  // ─────────────────────────────────────────────
  if (
    !batches ||
    batches.length === 0
  ) {

    return res.status(200).json(

      new ApiResponse(

        200,

        {

          summary: {

            totalBatches: 0,

            totalOrders: 0,

            totalDeliveries: 0
          },

          batches: []
        },

        "No delivery batches found"
      )
    );
  }

  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────
  let totalOrders = 0;

  let totalDeliveries = 0;

  // ─────────────────────────────────────────────
  // FORMAT BATCHES
  // ─────────────────────────────────────────────
  const formattedBatches =

    batches.map(batch => {

      totalOrders +=
        batch.orders.length;

      totalDeliveries +=
        batch.orders.length;

      return {

        batchId:
          batch._id,

        status:
          batch.status,

        // ✅ NEW
        viewToDriver:
          batch.viewToDriver,

        createdAt:
          batch.createdAt,

        updatedAt:
          batch.updatedAt,

        finalizedAt:
          batch.finalizedAt || null,

        totalOrders:
          batch.orders.length,

        // ===================================================
        // ORDERS
        // ===================================================
        orders:
          batch.orders.map(orderData => {

            const order =
              orderData.orderId;

            return {

              // ✅ SEQUENCE
              sequence:
                orderData?.sequence || null,

              deliverySequence:
                orderData?.sequence || null,

              // ✅ ORDER DETAILS
              orderId:
                order?._id || null,

              orderNumber:
                order?._id
                  ?.toString()
                  ?.slice(-6)
                  ?.toUpperCase(),

              totalAmount:
                order?.totalAmount || 0,

              status:
                order?.status || "",

              deliveredAt:
                order?.deliveredAt || null,

              isorderdelivered:
                order?.isorderdelivered || false,

              deliveryProofImage:
                order?.deliveryProofImage || null,

              paymentRequested:
                order?.paymentRequested || false,

              deliveryDate:
                order?.deliveryDate || null,

              paymentStatus:
                order?.payment?.status || "",

              paymentMethod:
                order?.payment?.method || "",

              // ✅ USER DETAILS
              user: {

                userId:
                  order?.userId?._id || null,

                username:
                  order?.userId?.username || "",

                full_name:
                  order?.userId?.full_name || "",

                phone_number:
                  order?.userId?.phone_number || ""
              },

              // ✅ DELIVERY DETAILS
              deliveryDetails: {

                addressId:
                  order?.deliveryDetails?.addressId || null,

                addressLine1:
                  order?.deliveryDetails?.addressLine1 || "",

                addressLine2:
                  order?.deliveryDetails?.addressLine2 || "",

                city:
                  order?.deliveryDetails?.city || "",

                state:
                  order?.deliveryDetails?.state || "",

                zipCode:
                  order?.deliveryDetails?.zipCode || "",

                country:
                  order?.deliveryDetails?.country || "",

                phone:
                  order?.deliveryDetails?.phone || "",

                instructions:
                  order?.deliveryDetails?.instructions || "",

                location: {

                  lat:
                    order?.deliveryDetails?.location?.lat || null,

                  lng:
                    order?.deliveryDetails?.location?.lng || null
                }
              },

              // ✅ ITEMS
              items:
                order?.items?.map(item => ({

                  name:
                    item.name || "",

                  quantity:
                    item.quantity || 0,

                  type:
                    item.type || "",

                  variant: {

                    size:
                      item.selectedVariant?.size || "",

                    price:
                      item.selectedVariant?.price || 0
                  },

                  subtotal:
                    item.subtotal || 0
                })) || [],

              itemCount:
                order?.items?.length || 0,

              placedAt:
                order?.createdAt || null
            };
          })

          // ✅ SORT BY SEQUENCE
          .sort(
            (a, b) =>

              (a.sequence || 0) -
              (b.sequence || 0)
          )
      };
    });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        // ✅ SUMMARY
        summary: {

          totalBatches:
            formattedBatches.length,

          totalOrders,

          totalDeliveries
        },

        // ✅ BATCHES
        batches:
          formattedBatches
      },

      "Driver batches fetched successfully"
    )
  );
});




const adminViewDriverBatches = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // ONLY SUPER ADMIN
  // ─────────────────────────────────────────────
  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS
  // ─────────────────────────────────────────────
  const { driverId } =
    req.params;

  if (!driverId) {

    throw new ApiError(
      400,
      "Driver ID is required"
    );
  }

  // ─────────────────────────────────────────────
  // CHECK DRIVER
  // ─────────────────────────────────────────────
  const driver =
    await Employee.findById(driverId);

  if (
    !driver ||
    driver.role !== "driver"
  ) {

    throw new ApiError(
      404,
      "Driver not found"
    );
  }

  // ─────────────────────────────────────────────
  // FETCH BATCHES
  // ─────────────────────────────────────────────
  const batches =
    await DeliveryBatch.find({

      driverId,

      status: {

        $in: [
          "finalized",
          "in_delivery"
        ]
      }
    })

    // ✅ POPULATE ORDERS
    .populate({

      path:
        "orders.orderId",

      populate: {

        path:
          "userId",

        select:
          `
          username
          full_name
          email
          phone_number
          `
      }
    })

    .sort({
      createdAt: -1
    });

  // ─────────────────────────────────────────────
  // EMPTY RESPONSE
  // ─────────────────────────────────────────────
  if (
    !batches ||
    batches.length === 0
  ) {

    return res.status(200).json(

      new ApiResponse(

        200,

        {

          driver: {

            driverId:
              driver._id,

            name:
              driver.name,

            email:
              driver.email
          },

          summary: {

            totalBatches: 0,

            totalOrders: 0,

            totalDeliveries: 0
          },

          batches: []
        },

        "No delivery batches found"
      )
    );
  }

  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────
  let totalOrders = 0;

  let totalDeliveries = 0;

  // ─────────────────────────────────────────────
  // FORMAT BATCHES
  // ─────────────────────────────────────────────
  const formattedBatches =

    batches.map(batch => {

      totalOrders +=
        batch.orders.length;

      totalDeliveries +=
        batch.orders.length;

      return {

        batchId:
          batch._id,

        status:
          batch.status,

        createdAt:
          batch.createdAt,

        updatedAt:
          batch.updatedAt,

        finalizedAt:
          batch.finalizedAt || null,

        totalOrders:
          batch.orders.length,

        // ===================================================
        // ORDERS
        // ===================================================
        orders:
          batch.orders.map(orderData => {

            const order =
              orderData.orderId;

            return {

              // ✅ SEQUENCE
              sequence:
                orderData?.sequence || null,

              deliverySequence:
                orderData?.sequence || null,

              // ✅ ORDER DETAILS
              orderId:
                order?._id || null,

              orderNumber:
                order?._id
                  ?.toString()
                  ?.slice(-6)
                  ?.toUpperCase(),

              totalAmount:
                order?.totalAmount || 0,

              status:
                order?.status || "",

              deliveredAt:
                order?.deliveredAt || null,

              isorderdelivered:
                order?.isorderdelivered || false,

              deliveryProofImage:
                order?.deliveryProofImage || null,

              paymentRequested:
                order?.paymentRequested || false,

              deliveryDate:
                order?.deliveryDate || null,

              paymentStatus:
                order?.payment?.status || "",

              paymentMethod:
                order?.payment?.method || "",

              // ✅ USER DETAILS
              user: {

                userId:
                  order?.userId?._id || null,

                username:
                  order?.userId?.username || "",

                full_name:
                  order?.userId?.full_name || "",

                email:
                  order?.userId?.email || "",

                phone_number:
                  order?.userId?.phone_number || ""
              },

              // ✅ DELIVERY DETAILS
              deliveryDetails: {

                addressId:
                  order?.deliveryDetails?.addressId || null,

                addressLine1:
                  order?.deliveryDetails?.addressLine1 || "",

                addressLine2:
                  order?.deliveryDetails?.addressLine2 || "",

                city:
                  order?.deliveryDetails?.city || "",

                state:
                  order?.deliveryDetails?.state || "",

                zipCode:
                  order?.deliveryDetails?.zipCode || "",

                country:
                  order?.deliveryDetails?.country || "",

                phone:
                  order?.deliveryDetails?.phone || "",

                instructions:
                  order?.deliveryDetails?.instructions || "",

                location: {

                  lat:
                    order?.deliveryDetails?.location?.lat || null,

                  lng:
                    order?.deliveryDetails?.location?.lng || null
                }
              },

              // ✅ ITEMS
              items:
                order?.items?.map(item => ({

                  name:
                    item.name || "",

                  quantity:
                    item.quantity || 0,

                  type:
                    item.type || "",

                  variant: {

                    size:
                      item.selectedVariant?.size || "",

                    price:
                      item.selectedVariant?.price || 0
                  },

                  subtotal:
                    item.subtotal || 0
                })) || [],

              itemCount:
                order?.items?.length || 0,

              placedAt:
                order?.createdAt || null
            };
          })

          // ✅ SORT BY SEQUENCE
          .sort(
            (a, b) =>

              (a.sequence || 0) -
              (b.sequence || 0)
          )
      };
    });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        // ✅ DRIVER DETAILS
        driver: {

          driverId:
            driver._id,

          name:
            driver.name,

          email:
            driver.email,

          phone:
            driver.phone,

          assignedArea:
            driver.assignedArea,

          isDriverAvailable:
            driver.isDriverAvailable,

          upForNextDelivery:
            driver.upForNextDelivery,

          nextDeliveryDate:
            driver.nextDeliveryDate
        },

        // ✅ SUMMARY
        summary: {

          totalBatches:
            formattedBatches.length,

          totalOrders,

          totalDeliveries
        },

        // ✅ BATCHES
        batches:
          formattedBatches
      },

      "Driver batches fetched successfully"
    )
  );
});




const adminViewBatchesHistory = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {
    area,
    date,
    status,
    page = 1,
    limit = 10
  } = req.query;

  // ─────────────────────────────────────────────
  // FILTER OBJECT
  // ─────────────────────────────────────────────
  const filter = {};

  // AREA FILTER
  if (area) {

    filter.area =
      area
        .trim()
        .toLowerCase();
  }

  // STATUS FILTER
  if (status) {

    filter.status =
      status;
  }

  // DATE FILTER
  if (date) {

    const startDate =
      new Date(date);

    startDate.setHours(
      0,
      0,
      0,
      0
    );

    const endDate =
      new Date(date);

    endDate.setHours(
      23,
      59,
      59,
      999
    );

    filter.createdAt = {

      $gte:
        startDate,

      $lte:
        endDate
    };
  }

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const pageNumber =
    parseInt(page);

  const limitNumber =
    parseInt(limit);

  const skip =
    (pageNumber - 1) *
    limitNumber;

  // ─────────────────────────────────────────────
  // FETCH BATCHES
  // ─────────────────────────────────────────────
  const batches =
    await DeliveryBatch.find(
      filter
    )

      // ✅ ACTIVE DRIVER
      .populate(
        "driverId",
        `
        name
        email
        phone
        assignedArea
        `
      )

      // ✅ HISTORY DRIVER
      .populate(
        "assignedToDriverHistory",
        `
        name
        email
        phone
        assignedArea
        `
      )

      // ✅ ORDERS
      .populate({

        path:
          "orders.orderId",

        populate: {

          path:
            "userId",

          select:
            `
            username
            full_name
            email
            phone_number
            `
        }
      })

      .sort({
        createdAt: -1
      })

      .skip(skip)

      .limit(limitNumber);

  // ─────────────────────────────────────────────
  // TOTAL COUNT
  // ─────────────────────────────────────────────
  const totalBatches =
    await DeliveryBatch.countDocuments(
      filter
    );

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedBatches =

    batches.map(batch => ({

      batchId:
        batch._id,

      area:
        batch.area,

      status:
        batch.status,

      viewToDriver:
        batch.viewToDriver,

      createdAt:
        batch.createdAt,

      finalizedAt:
        batch.finalizedAt,

      totalOrders:
        batch.orders.length,

      // ✅ CURRENT DRIVER
      activeDriver: {

        driverId:
          batch.driverId?._id || null,

        name:
          batch.driverId?.name || "",

        email:
          batch.driverId?.email || "",

        phone:
          batch.driverId?.phone || "",

        assignedArea:
          batch.driverId?.assignedArea || ""
      },

      // ✅ HISTORY DRIVER
      assignedToDriverHistory: {

        driverId:
          batch.assignedToDriverHistory?._id || null,

        name:
          batch.assignedToDriverHistory?.name || "",

        email:
          batch.assignedToDriverHistory?.email || "",

        phone:
          batch.assignedToDriverHistory?.phone || "",

        assignedArea:
          batch.assignedToDriverHistory?.assignedArea || ""
      },

      // ✅ ORDERS
      orders:
        batch.orders.map(
          orderData => {

            const order =
              orderData.orderId;

            return {

              // ✅ SEQUENCE
              sequence:
                orderData.sequence,

              // ✅ ORDER DETAILS
              orderId:
                order?._id || null,

              status:
                order?.status || "",

              totalAmount:
                order?.totalAmount || 0,

              deliveryDate:
                order?.deliveryDate || null,

              deliveredAt:
                order?.deliveredAt || null,

              isorderdelivered:
                order?.isorderdelivered || false,

              paymentMethod:
                order?.payment?.method || "",

              paymentStatus:
                order?.payment?.status || "",

              // ✅ DELIVERY ASSIGNMENT
              deliveryAssignment: {

                driverId:
                  order?.deliveryAssignment?.driverId || null,

                batchId:
                  order?.deliveryAssignment?.batchId || null,

                deliverySequence:
                  order?.deliveryAssignment?.deliverySequence || null,

                assignedAt:
                  order?.deliveryAssignment?.assignedAt || null
              },

              // ✅ USER
              user: {

                userId:
                  order?.userId?._id || null,

                username:
                  order?.userId?.username || "",

                full_name:
                  order?.userId?.full_name || "",

                email:
                  order?.userId?.email || "",

                phone:
                  order?.userId?.phone_number || ""
              },

              // ✅ ADDRESS
              deliveryDetails: {

                addressLine1:
                  order?.deliveryDetails
                    ?.addressLine1 || "",

                addressLine2:
                  order?.deliveryDetails
                    ?.addressLine2 || "",

                city:
                  order?.deliveryDetails
                    ?.city || "",

                state:
                  order?.deliveryDetails
                    ?.state || "",

                zipCode:
                  order?.deliveryDetails
                    ?.zipCode || "",

                country:
                  order?.deliveryDetails
                    ?.country || ""
              }
            };
          }
        )

        // ✅ SORT BY SEQUENCE
        .sort(
          (a, b) =>
            a.sequence -
            b.sequence
        )
    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {

        filters: {

          area:
            area || null,

          date:
            date || null,

          status:
            status || null
        },

        pagination: {

          currentPage:
            pageNumber,

          totalPages:
            Math.ceil(
              totalBatches /
              limitNumber
            ),

          totalBatches,

          limit:
            limitNumber
        },

        batches:
          formattedBatches
      },

      "Batch history fetched successfully"
    )
  );
});



const adminViewDriverBatchHistory = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS
  // ─────────────────────────────────────────────
  const { driverId } =
    req.params;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  if (!driverId) {

    throw new ApiError(
      400,
      "Driver ID is required"
    );
  }

  // ─────────────────────────────────────────────
  // CHECK DRIVER
  // ─────────────────────────────────────────────
  const driver =
    await Employee.findById(
      driverId
    );

  if (
    !driver ||
    driver.role !== "driver"
  ) {

    throw new ApiError(
      404,
      "Driver not found"
    );
  }

  // ─────────────────────────────────────────────
  // FETCH LAST 10 BATCHES
  // USING HISTORY DRIVER
  // ─────────────────────────────────────────────
  const batches =
    await DeliveryBatch.find({

      assignedToDriverHistory:
        driverId
    })

      // ACTIVE DRIVER
      .populate(
        "driverId",
        `
        name
        email
        phone
        assignedArea
        `
      )

      // HISTORY DRIVER
      .populate(
        "assignedToDriverHistory",
        `
        name
        email
        phone
        assignedArea
        `
      )

      // ORDERS
      .populate({

        path:
          "orders.orderId",

        populate: {

          path:
            "userId",

          select:
            `
            username
            full_name
            email
            phone_number
            `
        }
      })

      .sort({
        createdAt: -1
      })

      .limit(10);

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedBatches =

    batches.map(batch => ({

      batchId:
        batch._id,

      area:
        batch.area,

      status:
        batch.status,

      createdAt:
        batch.createdAt,

      finalizedAt:
        batch.finalizedAt,

      viewToDriver:
        batch.viewToDriver,

      totalOrders:
        batch.orders.length,

      // ✅ ACTIVE DRIVER
      activeDriver: {

        driverId:
          batch.driverId?._id || null,

        name:
          batch.driverId?.name || "",

        email:
          batch.driverId?.email || "",

        phone:
          batch.driverId?.phone || "",

        assignedArea:
          batch.driverId?.assignedArea || ""
      },

      // ✅ HISTORY DRIVER
      assignedToDriverHistory: {

        driverId:
          batch.assignedToDriverHistory?._id || null,

        name:
          batch.assignedToDriverHistory?.name || "",

        email:
          batch.assignedToDriverHistory?.email || "",

        phone:
          batch.assignedToDriverHistory?.phone || "",

        assignedArea:
          batch.assignedToDriverHistory?.assignedArea || ""
      },

      // ✅ ORDERS
      orders:
        batch.orders.map(
          orderData => {

            const order =
              orderData.orderId;

            return {

              sequence:
                orderData.sequence,

              orderId:
                order?._id || null,

              status:
                order?.status || "",

              totalAmount:
                order?.totalAmount || 0,

              deliveryDate:
                order?.deliveryDate || null,

              deliveredAt:
                order?.deliveredAt || null,

              isorderdelivered:
                order?.isorderdelivered || false,

              deliveryProofImage:
                order?.deliveryProofImage || null,

              paymentMethod:
                order?.payment?.method || "",

              paymentStatus:
                order?.payment?.status || "",

              // USER
              user: {

                userId:
                  order?.userId?._id || null,

                username:
                  order?.userId?.username || "",

                full_name:
                  order?.userId?.full_name || "",

                email:
                  order?.userId?.email || "",

                phone:
                  order?.userId?.phone_number || ""
              },

              // ADDRESS
              deliveryDetails: {

                addressLine1:
                  order?.deliveryDetails
                    ?.addressLine1 || "",

                addressLine2:
                  order?.deliveryDetails
                    ?.addressLine2 || "",

                city:
                  order?.deliveryDetails
                    ?.city || "",

                state:
                  order?.deliveryDetails
                    ?.state || "",

                zipCode:
                  order?.deliveryDetails
                    ?.zipCode || "",

                country:
                  order?.deliveryDetails
                    ?.country || ""
              }
            };
          }
        )

        .sort(
          (a, b) =>
            a.sequence -
            b.sequence
        )
    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {

        driver: {

          driverId:
            driver._id,

          name:
            driver.name,

          email:
            driver.email,

          phone:
            driver.phone,

          assignedArea:
            driver.assignedArea || ""
        },

        totalBatches:
          formattedBatches.length,

        batches:
          formattedBatches
      },

      "Driver batch history fetched successfully"
    )
  );
});



const getUnassignedConfirmedOrders = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {

    area,

    // ✅ OPTIONAL FILTERS
    paymentStatus,
    productName,

    // ✅ DATE FILTERS
    date,
    startDate,
    endDate,

    page = 1,
    limit = 10

  } = req.query;

  // ─────────────────────────────────────────────
  // BASE FILTER
  // ONLY:
  // ✅ confirmed orders
  // ✅ not assigned to batch
  // ─────────────────────────────────────────────
  const filter = {

    status: "confirmed",

    $or: [

      {
        "deliveryAssignment.batchId":
          null
      },

      {
        deliveryAssignment: {
          $exists: false
        }
      }
    ]
  };

  // ─────────────────────────────────────────────
  // AREA FILTER
  // ─────────────────────────────────────────────
  if (
    area &&
    area.trim() !== ""
  ) {

    const cities =
      AREA_CITY_MAP[
        area.toLowerCase()
      ];

    if (!cities) {

      throw new ApiError(
        400,
        "Invalid area provided"
      );
    }

    filter["deliveryDetails.city"] = {
      $in: cities
    };
  }

  // ─────────────────────────────────────────────
  // PAYMENT STATUS FILTER
  // ─────────────────────────────────────────────
  if (
    paymentStatus &&
    paymentStatus.trim() !== ""
  ) {

    filter["payment.status"] =
      paymentStatus.trim();
  }

  // ─────────────────────────────────────────────
  // PRODUCT FILTER
  // ─────────────────────────────────────────────
  if (
    productName &&
    productName.trim() !== ""
  ) {

    filter["items.name"] = {

      $regex:
        productName.trim(),

      $options: "i"
    };
  }

  // ─────────────────────────────────────────────
  // SINGLE DATE FILTER
  // ─────────────────────────────────────────────
  if (date) {

    const selectedDate =
      new Date(date);

    const startOfDay =
      new Date(selectedDate);

    startOfDay.setHours(
      0,
      0,
      0,
      0
    );

    const endOfDay =
      new Date(selectedDate);

    endOfDay.setHours(
      23,
      59,
      59,
      999
    );

    filter.createdAt = {

      $gte:
        startOfDay,

      $lte:
        endOfDay
    };
  }

  // ─────────────────────────────────────────────
  // DATE RANGE FILTER
  // ─────────────────────────────────────────────
  if (
    startDate ||
    endDate
  ) {

    filter.createdAt = {};

    if (startDate) {

      filter.createdAt.$gte =
        new Date(startDate);
    }

    if (endDate) {

      const end =
        new Date(endDate);

      end.setHours(
        23,
        59,
        59,
        999
      );

      filter.createdAt.$lte =
        end;
    }
  }

  console.log(filter);

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 10;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const [orders, totalOrders] =
    await Promise.all([

      Order.find(filter)

        .populate(
          "userId",
          `
          username
          full_name
          email
          phone_number
          `
        )

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      Order.countDocuments(filter)
    ]);

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedOrders =
    orders.map(order => ({

      orderId:
        order._id,

      user: {

        userId:
          order.userId?._id,

        username:
          order.userId?.username || "",

        full_name:
          order.userId?.full_name || "",

        email:
          order.userId?.email || "",

        phone:
          order.userId?.phone_number || ""
      },

      status:
        order.status,

      payment:
        order.payment || {},

      totalAmount:
        order.totalAmount,

      paymentRequested:
        order.paymentRequested || false,

      deliveryDate:
        order.deliveryDate || null,

      deliveredAt:
        order.deliveredAt || null,

      deliveryDetails: {

        addressLine1:
          order.deliveryDetails
            ?.addressLine1 || "",

        addressLine2:
          order.deliveryDetails
            ?.addressLine2 || "",

        city:
          order.deliveryDetails
            ?.city || "",

        state:
          order.deliveryDetails
            ?.state || "",

        zipCode:
          order.deliveryDetails
            ?.zipCode || "",

        country:
          order.deliveryDetails
            ?.country || "",

        phone:
          order.deliveryDetails
            ?.phone || "",

        instructions:
          order.deliveryDetails
            ?.instructions || "",

        location: {

          lat:
            order.deliveryDetails
              ?.location?.lat || null,

          lng:
            order.deliveryDetails
              ?.location?.lng || null
        }
      },

      itemCount:
        order.items.length,

      items:
        order.items.map(item => ({

          productId:
            item.productId,

          name:
            item.name,

          quantity:
            item.quantity,

          price:
            item.price,

          type:
            item.type,

          total:
            item.price *
            item.quantity
        })),

      placedAt:
        order.createdAt

    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {

        filters: {

          area:
            area || null,

          paymentStatus:
            paymentStatus || null,

          productName:
            productName || null,

          date:
            date || null,

          startDate:
            startDate || null,

          endDate:
            endDate || null
        },

        totalOrders,

        orders:
          formattedOrders,

        pagination: {

          currentPage,

          totalPages:
            Math.ceil(
              totalOrders / perPage
            ),

          limit:
            perPage
        }

      },

      "Unassigned confirmed orders fetched successfully"
    )
  );
});




const getResetUnDeliveredOrders = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // QUERY PARAMS
  // ─────────────────────────────────────────────
  const {

    area,

    paymentStatus,

    productName,

    date,
    startDate,
    endDate,

    page = 1,
    limit = 10

  } = req.query;

  // ─────────────────────────────────────────────
  // BASE FILTER
  // ORDERS:
  // ✅ RESET FROM DRIVER
  // ✅ NOT DELIVERED
  // ✅ HISTORY DRIVER EXISTS
  // ─────────────────────────────────────────────
  const filter = {

    isorderdelivered: false,

    "deliveryAssignment.driverId":
      null,

    "deliveryAssignment.assignedToDriverHistory": {
      $ne: null
    }
  };

  // ─────────────────────────────────────────────
  // AREA FILTER
  // ─────────────────────────────────────────────
  if (
    area &&
    area.trim() !== ""
  ) {

    const cities =
      AREA_CITY_MAP[
        area
      ];

    if (!cities) {

      throw new ApiError(
        400,
        "Invalid area provided"
      );
    }

    filter["deliveryDetails.city"] = {
      $in: cities
    };
  }

  // ─────────────────────────────────────────────
  // PAYMENT STATUS FILTER
  // ─────────────────────────────────────────────
  if (
    paymentStatus &&
    paymentStatus.trim() !== ""
  ) {

    filter["payment.status"] =
      paymentStatus.trim();
  }

  // ─────────────────────────────────────────────
  // PRODUCT FILTER
  // ─────────────────────────────────────────────
  if (
    productName &&
    productName.trim() !== ""
  ) {

    filter["items.name"] = {

      $regex:
        productName.trim(),

      $options: "i"
    };
  }

  // ─────────────────────────────────────────────
  // SINGLE DATE FILTER
  // ─────────────────────────────────────────────
  if (date) {

    const selectedDate =
      new Date(date);

    const startOfDay =
      new Date(selectedDate);

    startOfDay.setHours(
      0,
      0,
      0,
      0
    );

    const endOfDay =
      new Date(selectedDate);

    endOfDay.setHours(
      23,
      59,
      59,
      999
    );

    filter.createdAt = {

      $gte:
        startOfDay,

      $lte:
        endOfDay
    };
  }

  // ─────────────────────────────────────────────
  // DATE RANGE FILTER
  // ─────────────────────────────────────────────
  if (
    startDate ||
    endDate
  ) {

    filter.createdAt = {};

    if (startDate) {

      filter.createdAt.$gte =
        new Date(startDate);
    }

    if (endDate) {

      const end =
        new Date(endDate);

      end.setHours(
        23,
        59,
        59,
        999
      );

      filter.createdAt.$lte =
        end;
    }
  }

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 10;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const [orders, totalOrders] =
    await Promise.all([

      Order.find(filter)

        // USER
        .populate(
          "userId",
          `
          username
          full_name
          email
          phone_number
          `
        )

        // DRIVER HISTORY
        .populate(
          "deliveryAssignment.assignedToDriverHistory",
          `
          name
          email
          phone
          assignedArea
          `
        )

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      Order.countDocuments(filter)
    ]);

  // ─────────────────────────────────────────────
  // FORMAT RESPONSE
  // ─────────────────────────────────────────────
  const formattedOrders =
    orders.map(order => ({

      orderId:
        order._id,

      status:
        order.status,

      totalAmount:
        order.totalAmount,

      payment:
        order.payment || {},

      paymentRequested:
        order.paymentRequested || false,

      deliveryDate:
        order.deliveryDate || null,

      deliveredAt:
        order.deliveredAt || null,

      isorderdelivered:
        order.isorderdelivered || false,

      // ✅ DRIVER HISTORY
      assignedToDriverHistory: {

        driverId:
          order
            ?.deliveryAssignment
            ?.assignedToDriverHistory
            ?._id || null,

        name:
          order
            ?.deliveryAssignment
            ?.assignedToDriverHistory
            ?.name || "",

        email:
          order
            ?.deliveryAssignment
            ?.assignedToDriverHistory
            ?.email || "",

        phone:
          order
            ?.deliveryAssignment
            ?.assignedToDriverHistory
            ?.phone || "",

        assignedArea:
          order
            ?.deliveryAssignment
            ?.assignedToDriverHistory
            ?.assignedArea || ""
      },

      // USER
      user: {

        userId:
          order.userId?._id,

        username:
          order.userId?.username || "",

        full_name:
          order.userId?.full_name || "",

        email:
          order.userId?.email || "",

        phone:
          order.userId?.phone_number || ""
      },

      // ADDRESS
      deliveryDetails: {

        addressLine1:
          order.deliveryDetails
            ?.addressLine1 || "",

        addressLine2:
          order.deliveryDetails
            ?.addressLine2 || "",

        city:
          order.deliveryDetails
            ?.city || "",

        state:
          order.deliveryDetails
            ?.state || "",

        zipCode:
          order.deliveryDetails
            ?.zipCode || "",

        country:
          order.deliveryDetails
            ?.country || "",

        phone:
          order.deliveryDetails
            ?.phone || "",

        instructions:
          order.deliveryDetails
            ?.instructions || "",

        location: {

          lat:
            order.deliveryDetails
              ?.location?.lat || null,

          lng:
            order.deliveryDetails
              ?.location?.lng || null
        }
      },

      itemCount:
        order.items.length,

      items:
        order.items.map(item => ({

          productId:
            item.productId,

          name:
            item.name,

          quantity:
            item.quantity,

          price:
            item.price,

          type:
            item.type,

          total:
            item.price *
            item.quantity
        })),

      placedAt:
        order.createdAt
    }));

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {

        filters: {

          area:
            area || null,

          paymentStatus:
            paymentStatus || null,

          productName:
            productName || null,

          date:
            date || null,

          startDate:
            startDate || null,

          endDate:
            endDate || null
        },

        totalOrders,

        orders:
          formattedOrders,

        pagination: {

          currentPage,

          totalPages:
            Math.ceil(
              totalOrders / perPage
            ),

          limit:
            perPage
        }

      },

      "Reset but undelivered orders fetched successfully"
    )
  );
});


const assignSingleOrder = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS
  // ─────────────────────────────────────────────
  const { orderId } =
    req.params;

  // ─────────────────────────────────────────────
  // BODY
  // ─────────────────────────────────────────────
  const { batchId } =
    req.body;

  // ─────────────────────────────────────────────
  // VALIDATION
  // ─────────────────────────────────────────────
  if (!orderId) {

    throw new ApiError(
      400,
      "Order ID is required"
    );
  }

  if (!batchId) {

    throw new ApiError(
      400,
      "Batch ID is required"
    );
  }

  // ─────────────────────────────────────────────
  // FIND ORDER
  // ─────────────────────────────────────────────
  const order =
    await Order.findById(orderId)

      .populate(
        "userId",
        `
        username
        full_name
        email
        phone_number
        `
      );

  if (!order) {

    throw new ApiError(
      404,
      "Order not found"
    );
  }

  // ─────────────────────────────────────────────
  // CHECK IF ALREADY ASSIGNED
  // ─────────────────────────────────────────────
  if (
    order.deliveryAssignment?.batchId
  ) {

    throw new ApiError(
      400,
      "Order is already assigned"
    );
  }

  // ─────────────────────────────────────────────
  // FIND BATCH
  // ─────────────────────────────────────────────
  const batch =
    await DeliveryBatch.findById(
      batchId
    );

  if (!batch) {

    throw new ApiError(
      404,
      "Batch not found"
    );
  }

  // ─────────────────────────────────────────────
  // FIND DRIVER FROM BATCH
  // ─────────────────────────────────────────────
  const driver =
    await Employee.findById(
      batch.driverId
    );

  if (
    !driver ||
    driver.role !== "driver"
  ) {

    throw new ApiError(
      404,
      "Driver not found"
    );
  }

  // ─────────────────────────────────────────────
  // LAST SEQUENCE
  // ADD ORDER AT LAST
  // ─────────────────────────────────────────────
  const lastSequence =
    batch.orders.length > 0

      ? Math.max(
          ...batch.orders.map(
            item =>
              item.sequence || 0
          )
        )

      : 0;

  const newSequence =
    lastSequence + 1;

  // ─────────────────────────────────────────────
  // ADD ORDER TO BATCH
  // ─────────────────────────────────────────────
  batch.orders.push({

    orderId:
      order._id,

    sequence:
      newSequence
  });

  await batch.save();

  // ─────────────────────────────────────────────
  // UPDATE ORDER ASSIGNMENT
  // ─────────────────────────────────────────────
  order.deliveryAssignment = {

    batchId:
      batch._id,

    driverId:
      driver._id,

    deliverySequence:
      newSequence,

    assignedAt:
      new Date()
  };

  await order.save();

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {

        orderId:
          order._id,

        batchId:
          batch._id,

        sequence:
          newSequence,

        driver: {

          driverId:
            driver._id,

          name:
            driver.name,

          email:
            driver.email
        },

        user: {

          userId:
            order.userId?._id,

          username:
            order.userId?.username || "",

          full_name:
            order.userId?.full_name || "",

          email:
            order.userId?.email || "",

          phone:
            order.userId?.phone_number || ""
        },

        status:
          order.status,

        totalAmount:
          order.totalAmount,

        payment:
          order.payment || {},

        deliveryDetails: {

          addressLine1:
            order.deliveryDetails
              ?.addressLine1 || "",

          addressLine2:
            order.deliveryDetails
              ?.addressLine2 || "",

          city:
            order.deliveryDetails
              ?.city || "",

          state:
            order.deliveryDetails
              ?.state || "",

          zipCode:
            order.deliveryDetails
              ?.zipCode || "",

          country:
            order.deliveryDetails
              ?.country || ""
        },
        placedAt:
          order.createdAt
      },

      "Order assigned successfully"
    )
  );
});



const unassignSingleOrder = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // PARAMS
  // ─────────────────────────────────────────────
  const { orderId } = req.params;

  if (!orderId) {
    throw new ApiError(400, "Order ID is required");
  }

  // ─────────────────────────────────────────────
  // FIND ORDER
  // ─────────────────────────────────────────────
  const order = await Order.findById(orderId).populate(
    "userId",
    "username full_name email phone_number"
  );

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  // ─────────────────────────────────────────────
  // MUST BE ASSIGNED
  // ─────────────────────────────────────────────
  if (!order.deliveryAssignment?.batchId) {
    throw new ApiError(400, "Order is already unassigned");
  }

  // ─────────────────────────────────────────────
  // GUARD: CANNOT UNASSIGN FROM ACTIVE BATCH
  // ─────────────────────────────────────────────
  const batch = await DeliveryBatch.findById(
    order.deliveryAssignment.batchId
  );

  if (!batch) {
    throw new ApiError(404, "Associated batch not found");
  }

  if (["in_delivery", "completed"].includes(batch.status)) {
    throw new ApiError(
      400,
      `Cannot unassign order from a batch that is already ${batch.status}`
    );
  }

  // ─────────────────────────────────────────────
  // PULL ORDER FROM BATCH
  // ─────────────────────────────────────────────
  batch.orders = batch.orders.filter(
    (o) => o.orderId.toString() !== orderId.toString()
  );

  // ─────────────────────────────────────────────
  // CHECK IF BATCH IS NOW EMPTY
  // AUTO DELETE IF NO ORDERS REMAIN
  // ─────────────────────────────────────────────
  let batchDeleted = false;

  if (batch.orders.length === 0) {

    await DeliveryBatch.findByIdAndDelete(batch._id);
    batchDeleted = true;

  } else {

    // ─────────────────────────────────────────────
    // REBALANCE SEQUENCE ON REMAINING ORDERS
    // FILL ANY GAPS LEFT BY REMOVED ORDER
    // ─────────────────────────────────────────────
    batch.orders = batch.orders
      .sort((a, b) => a.sequence - b.sequence)
      .map((o, i) => ({ ...o, sequence: i + 1 }));

    await batch.save();

    // ─────────────────────────────────────────────
    // SYNC SEQUENCE ON REMAINING ORDER DOCS
    // ─────────────────────────────────────────────
    const sequenceBulkOps = batch.orders.map((o) => ({
      updateOne: {
        filter: { _id: o.orderId },
        update: {
          $set: {
            "deliveryAssignment.deliverySequence": o.sequence,
          },
        },
      },
    }));

    await Order.bulkWrite(sequenceBulkOps);
  }

  // ─────────────────────────────────────────────
  // RESET ORDER BACK TO NORMAL
  // NEVER TOUCH assignedToDriverHistory
  // ─────────────────────────────────────────────
  order.deliveryAssignment.driverId = null;
  order.deliveryAssignment.batchId = null;
  order.deliveryAssignment.deliverySequence = null;
  order.deliveryAssignment.assignedAt = null;
  // ✅ assignedToDriverHistory → intentionally left untouched

  // ─────────────────────────────────────────────
  // RESET ORDER STATUS BACK TO CONFIRMED
  // ONLY IF IT WAS PUSHED TO out_for_delivery
  // ─────────────────────────────────────────────
  if (order.status === "out_for_delivery") {
    order.status = "confirmed";
  }

  await order.save();

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        orderId: order._id,

        user: {
          userId: order.userId?._id,
          username: order.userId?.username || "",
          full_name: order.userId?.full_name || "",
          email: order.userId?.email || "",
          phone: order.userId?.phone_number || "",
        },

        status: order.status,
        totalAmount: order.totalAmount,
        payment: order.payment || {},

        deliveryDetails: {
          addressLine1: order.deliveryDetails?.addressLine1 || "",
          addressLine2: order.deliveryDetails?.addressLine2 || "",
          city: order.deliveryDetails?.city || "",
          state: order.deliveryDetails?.state || "",
          zipCode: order.deliveryDetails?.zipCode || "",
          country: order.deliveryDetails?.country || "",
        },

        deliveryAssignment: order.deliveryAssignment,

        // ─────────────────────────────────────────
        // BATCH INFO DIFFERS BASED ON DELETE OR NOT
        // ─────────────────────────────────────────
        batch: batchDeleted
          ? {
              batchId: batch._id,
              status: "deleted",
              message:
                "Batch was automatically deleted as it had no remaining orders. Next upsert will create a fresh batch.",
            }
          : {
              batchId: batch._id,
              remainingOrders: batch.orders.length,
              status: batch.status,
            },

        placedAt: order.createdAt,
      },
      batchDeleted
        ? "Order unassigned and empty batch automatically deleted"
        : "Order unassigned successfully and returned to available pool"
    )
  );
});



const resetConfirmedOrders = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  // ─────────────────────────────────────────────
  // UPDATE ALL CONFIRMED ORDERS
  // → pending
  // ─────────────────────────────────────────────
  const result =
    await Order.updateMany(

      {
        status: "confirmed"
      },

      {
        $set: {

          // ✅ RESET STATUS
          status: "pending"
        },

        // ✅ REMOVE DELIVERY ASSIGNMENT
        $unset: {

          deliveryAssignment: ""
        }
      }
    );

  // ─────────────────────────────────────────────
  // OPTIONAL:
  // DELETE DELIVERY BATCHES
  // ─────────────────────────────────────────────
  const deletedBatches =
    await DeliveryBatch.deleteMany({});

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(
      200,
      {

        matchedOrders:
          result.matchedCount,

        updatedOrders:
          result.modifiedCount,

        deletedBatches:
          deletedBatches.deletedCount
      },

      "All confirmed orders reset to pending successfully"
    )
  );
});


















const adminPaymentHistoryByArea = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  const {
    area,

    // ✅ PAYMENT FILTER
    paymentStatus,

    // ✅ DATE FILTERS
    date,
    startDate,
    endDate,

    // ✅ PAGINATION
    page = 1,
    limit = 10

  } = req.query;

  // ─────────────────────────────────────────────
  // AREA REQUIRED
  // ─────────────────────────────────────────────
  if (!area) {

    throw new ApiError(
      400,
      "Area is required"
    );
  }

  // ─────────────────────────────────────────────
  // GET CITIES
  // ─────────────────────────────────────────────
  const cities =
    AREA_CITY_MAP[area.toLowerCase()];

  if (!cities) {

    throw new ApiError(
      400,
      "Invalid area provided"
    );
  }

  // ─────────────────────────────────────────────
  // BASE FILTER
  // ─────────────────────────────────────────────
  const filter = {

    "deliveryDetails.city": {
      $in: cities
    }

  };

  // ─────────────────────────────────────────────
  // PAYMENT STATUS FILTER
  // ─────────────────────────────────────────────
  if (paymentStatus) {

    filter["payment.status"] =
      paymentStatus;
  }

  // ─────────────────────────────────────────────
  // SINGLE DATE FILTER
  // ─────────────────────────────────────────────
  if (date) {

    const selectedDate =
      new Date(date);

    const startOfDay =
      new Date(selectedDate);

    startOfDay.setHours(
      0, 0, 0, 0
    );

    const endOfDay =
      new Date(selectedDate);

    endOfDay.setHours(
      23, 59, 59, 999
    );

    filter.createdAt = {

      $gte: startOfDay,
      $lte: endOfDay

    };
  }

  // ─────────────────────────────────────────────
  // DATE RANGE FILTER
  // ─────────────────────────────────────────────
  if (startDate || endDate) {

    filter.createdAt = {};

    if (startDate) {

      filter.createdAt.$gte =
        new Date(startDate);
    }

    if (endDate) {

      const end =
        new Date(endDate);

      end.setHours(
        23, 59, 59, 999
      );

      filter.createdAt.$lte =
        end;
    }
  }

  // ─────────────────────────────────────────────
  // PAGINATION
  // ─────────────────────────────────────────────
  const currentPage =
    Number(page) || 1;

  const perPage =
    Number(limit) || 10;

  const skip =
    (currentPage - 1) * perPage;

  // ─────────────────────────────────────────────
  // FETCH ORDERS
  // ─────────────────────────────────────────────
  const [orders, totalOrders] =
    await Promise.all([

      Order.find(filter)

        .populate(
          "userId",
          "full_name phone_number username"
        )

        .sort({
          createdAt: -1
        })

        .skip(skip)

        .limit(perPage)

        .lean(),

      Order.countDocuments(filter)

    ]);

  // ─────────────────────────────────────────────
  // FORMAT PAYMENTS
  // ─────────────────────────────────────────────
  const formattedPayments =
    orders.map(order => ({

      orderId:
        order._id,

      user: {

        userId:
          order.userId?._id || null,

        name:
          order.userId?.full_name || "",

        username:
          order.userId?.username || "",

        phone:
          order.userId?.phone_number ||
          order.deliveryDetails?.phone || "",

        address: {

          addressId:
            order.deliveryDetails?.addressId || "",

          addressLine1:
            order.deliveryDetails?.addressLine1 || "",

          addressLine2:
            order.deliveryDetails?.addressLine2 || "",

          city:
            order.deliveryDetails?.city || "",

          state:
            order.deliveryDetails?.state || "",

          zipCode:
            order.deliveryDetails?.zipCode || "",

          country:
            order.deliveryDetails?.country || "",

          location: {

            lat:
              order.deliveryDetails?.location?.lat || null,

            lng:
              order.deliveryDetails?.location?.lng || null

          }

        }

      },

      payment: {

        method:
          order.payment?.method || "",

        status:
          order.payment?.status || ""

      },

      totalAmount:
        order.totalAmount || 0,

      paymentRequested:
        order.paymentRequested || false,

      status:
        order.status,

      deliveryDate:
        order.deliveryDate || null,

      deliveredAt:
        order.deliveredAt || null,

      placedAt:
        order.createdAt

    }));

  // ─────────────────────────────────────────────
  // AREA SUMMARY REPORT
  // ─────────────────────────────────────────────
  const report = {

    title:
      `Total ${area} - Delivery Cycle Report`,

    deliveryCycle:
      date ||
      `${startDate || "N/A"} to ${endDate || "N/A"}`,

    totalConfirmedOrders: 0,

    paid: 0,

    unpaid: 0,

    totalAmount: 0,

    received: 0,

    remaining: 0

  };

  // ─────────────────────────────────────────────
  // CALCULATE REPORT
  // ─────────────────────────────────────────────
  orders.forEach(order => {

    // ONLY CONFIRMED ORDERS
    if (
      order.status?.toLowerCase() !==
      "confirmed"
    ) {
      return;
    }

    const amount =
      Number(order.totalAmount || 0);

    report.totalConfirmedOrders += 1;

    report.totalAmount += amount;

    // PAID
    if (
      order.payment?.status
        ?.toLowerCase() === "paid"
    ) {

      report.paid += 1;

      report.received += amount;

    }

    // UNPAID
    else {

      report.unpaid += 1;

      report.remaining += amount;

    }

  });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        area,

        citiesCovered:
          cities,

        filters: {

          paymentStatus:
            paymentStatus || null,

          date:
            date || null,

          startDate:
            startDate || null,

          endDate:
            endDate || null

        },

        // ✅ SUMMARY REPORT
        report,

        // ✅ PAYMENT HISTORY
        payments:
          formattedPayments,

        // ✅ PAGINATION
        pagination: {

          totalOrders,

          currentPage,

          totalPages: Math.ceil(
            totalOrders / perPage
          ),

          limit:
            perPage

        }

      },

      "Payment history fetched successfully"

    )

  );

});




const sendPaymentReminder = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  const { orderId } = req.params;
  console.log(req.params);
  

  // ─────────────────────────────────────────────
  // FETCH ORDER
  // ─────────────────────────────────────────────
  const order = await Order.findById(orderId)
    .populate(
      "userId",
      "full_name email username phone_number"
    );

  if (!order) {

    throw new ApiError(
      404,
      "Order not found"
    );
  }

  // ─────────────────────────────────────────────
  // CHECK USER EMAIL
  // ─────────────────────────────────────────────
  if (!order.userId?.email) {

    throw new ApiError(
      400,
      "User email not found"
    );
  }

  // ─────────────────────────────────────────────
  // CHECK PAYMENT STATUS
  // ─────────────────────────────────────────────
  if (
    order.payment?.status?.toLowerCase() ===
    "paid"
  ) {

    throw new ApiError(
      400,
      "Payment already completed"
    );
  }

  // ─────────────────────────────────────────────
  // PAYMENT DETAILS
  // ─────────────────────────────────────────────
  const paymentDetails = {

    accountName:
      process.env.PAYMENT_ACCOUNT_NAME,

    bankName:
      process.env.PAYMENT_BANK_NAME,

    accountNumber:
      process.env.PAYMENT_ACCOUNT_NUMBER,

    ifscCode:
      process.env.PAYMENT_IFSC,

    zelle:
      process.env.PAYMENT_ZELLE,

    venmo:
      process.env.PAYMENT_VENMO

  };

  // ─────────────────────────────────────────────
  // ITEMS HTML
  // ─────────────────────────────────────────────
  const itemsHtml = order.items.map(item => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">
          ${item.name}
        </td>

        <td style="padding:8px;border:1px solid #ddd;">
          ${item.quantity}
        </td>

        <td style="padding:8px;border:1px solid #ddd;">
          $${item.price}
        </td>

        <td style="padding:8px;border:1px solid #ddd;">
          $${item.price * item.quantity}
        </td>
      </tr>
  `).join("");

  // ─────────────────────────────────────────────
  // EMAIL HTML
  // ─────────────────────────────────────────────
  const html = `
  
  <div style="font-family: Arial, sans-serif; max-width: 700px; margin:auto;">

    <h2>
      Payment Reminder
    </h2>

    <p>
      Hello ${order.userId.full_name},
    </p>

    <p>
      This is a friendly reminder to clear your pending payment for your recent order.
    </p>

    <hr />

    <h3>
      Order Details
    </h3>

    <p>
      <strong>Order ID:</strong>
      ${order._id}
    </p>

    <p>
      <strong>Order Date:</strong>
      ${new Date(order.createdAt).toLocaleDateString()}
    </p>

    <p>
      <strong>Total Amount:</strong>
      $${order.totalAmount}
    </p>

    <p>
      <strong>Payment Status:</strong>
      ${order.payment?.status || "unpaid"}
    </p>

    <h3>
      Ordered Items
    </h3>

    <table style="width:100%; border-collapse: collapse;">

      <thead>

        <tr style="background:#f5f5f5;">

          <th style="padding:8px;border:1px solid #ddd;">
            Product
          </th>

          <th style="padding:8px;border:1px solid #ddd;">
            Qty
          </th>

          <th style="padding:8px;border:1px solid #ddd;">
            Price
          </th>

          <th style="padding:8px;border:1px solid #ddd;">
            Total
          </th>

        </tr>

      </thead>

      <tbody>
        ${itemsHtml}
      </tbody>

    </table>

    <hr />

    <h3>
      Payment Details
    </h3>

    <p>
      Please complete your payment using any of the following methods:
    </p>

    <ul>

      ${
        paymentDetails.accountName
        ? `<li><strong>Account Name:</strong> ${paymentDetails.accountName}</li>`
        : ""
      }

      ${
        paymentDetails.bankName
        ? `<li><strong>Bank:</strong> ${paymentDetails.bankName}</li>`
        : ""
      }

      ${
        paymentDetails.accountNumber
        ? `<li><strong>Account Number:</strong> ${paymentDetails.accountNumber}</li>`
        : ""
      }

      ${
        paymentDetails.ifscCode
        ? `<li><strong>IFSC:</strong> ${paymentDetails.ifscCode}</li>`
        : ""
      }

      ${
        paymentDetails.zelle
        ? `<li><strong>Zelle:</strong> ${paymentDetails.zelle}</li>`
        : ""
      }

      ${
        paymentDetails.venmo
        ? `<li><strong>Venmo:</strong> ${paymentDetails.venmo}</li>`
        : ""
      }

    </ul>

    <hr />

    <p>
      Once payment is completed, kindly share payment confirmation with our support team.
    </p>

    <p>
      Thank you for choosing us ❤️
    </p>

  </div>
  `;

  // ─────────────────────────────────────────────
  // SEND EMAIL
  // ─────────────────────────────────────────────
  await sendEmail({

    to: order.userId.email,

    subject:
      "Payment Reminder - Pending Payment",

    html

  });

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {
        orderId: order._id,
        email: order.userId.email,
        username: order.userId.username,
        full_name: order.userId.full_name
      },

      "Payment reminder email sent successfully"

    )

  );

});






const sendBulkPaymentRemindersByArea = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);

  const { area } = req.params;

  // ─────────────────────────────────────────────
  // AREA REQUIRED
  // ─────────────────────────────────────────────
  if (!area) {

    throw new ApiError(
      400,
      "Area is required"
    );
  }

  // ─────────────────────────────────────────────
  // GET CITIES
  // ─────────────────────────────────────────────
  const cities =
    AREA_CITY_MAP[area.toLowerCase()];

  if (!cities) {

    throw new ApiError(
      400,
      "Invalid area provided"
    );
  }

  // ─────────────────────────────────────────────
  // FETCH PENDING PAYMENT ORDERS
  // ─────────────────────────────────────────────
  const orders = await Order.find({

    "deliveryDetails.city": {
      $in: cities
    },

    "payment.status": {
      $in: ["pending", "unpaid"]
    }

  })

    .populate(
      "userId",
      "full_name email username phone_number"
    )

    .sort({
      createdAt: -1
    })

    .lean();

  // ─────────────────────────────────────────────
  // NO ORDERS FOUND
  // ─────────────────────────────────────────────
  if (!orders.length) {

    return res.status(200).json(

      new ApiResponse(

        200,

        {
          totalEmailsSent: 0
        },

        "No pending payments found"

      )

    );
  }

  // ─────────────────────────────────────────────
  // PAYMENT DETAILS
  // ─────────────────────────────────────────────
  const paymentDetails = {

    accountName:
      process.env.PAYMENT_ACCOUNT_NAME,

    bankName:
      process.env.PAYMENT_BANK_NAME,

    accountNumber:
      process.env.PAYMENT_ACCOUNT_NUMBER,

    ifscCode:
      process.env.PAYMENT_IFSC,

    zelle:
      process.env.PAYMENT_ZELLE,

    venmo:
      process.env.PAYMENT_VENMO

  };

  // ─────────────────────────────────────────────
  // SEND EMAILS
  // ─────────────────────────────────────────────
  const sentEmails = [];
  const failedEmails = [];

  for (const order of orders) {

    try {

      // SKIP IF EMAIL NOT FOUND
      if (!order.userId?.email) {

        failedEmails.push({

          orderId: order._id,
          reason: "User email missing"

        });

        continue;
      }

      // ITEMS HTML
      const itemsHtml =
        order.items.map(item => `

        <tr>

          <td style="padding:8px;border:1px solid #ddd;">
            ${item.name}
          </td>

          <td style="padding:8px;border:1px solid #ddd;">
            ${item.quantity}
          </td>

          <td style="padding:8px;border:1px solid #ddd;">
            $${item.price}
          </td>

          <td style="padding:8px;border:1px solid #ddd;">
            $${item.price * item.quantity}
          </td>

        </tr>

      `).join("");

      // EMAIL TEMPLATE
      const html = `

      <div style="font-family: Arial, sans-serif; max-width: 700px; margin:auto;">

        <h2>
          Payment Reminder
        </h2>

        <p>
          Hello ${order.userId.full_name},
        </p>

        <p>
          This is a friendly reminder to clear your pending payment for your recent order.
        </p>

        <hr />

        <h3>
          Order Details
        </h3>

        <p>
          <strong>Order ID:</strong>
          ${order._id}
        </p>

        <p>
          <strong>Total Amount:</strong>
          $${order.totalAmount}
        </p>

        <p>
          <strong>Payment Status:</strong>
          ${order.payment?.status || "pending"}
        </p>

        <h3>
          Ordered Items
        </h3>

        <table style="width:100%; border-collapse: collapse;">

          <thead>

            <tr style="background:#f5f5f5;">

              <th style="padding:8px;border:1px solid #ddd;">
                Product
              </th>

              <th style="padding:8px;border:1px solid #ddd;">
                Qty
              </th>

              <th style="padding:8px;border:1px solid #ddd;">
                Price
              </th>

              <th style="padding:8px;border:1px solid #ddd;">
                Total
              </th>

            </tr>

          </thead>

          <tbody>
            ${itemsHtml}
          </tbody>

        </table>

        <hr />

        <h3>
          Payment Methods
        </h3>

        <ul>

          ${
            paymentDetails.accountName
            ? `<li><strong>Account Name:</strong> ${paymentDetails.accountName}</li>`
            : ""
          }

          ${
            paymentDetails.bankName
            ? `<li><strong>Bank:</strong> ${paymentDetails.bankName}</li>`
            : ""
          }

          ${
            paymentDetails.accountNumber
            ? `<li><strong>Account Number:</strong> ${paymentDetails.accountNumber}</li>`
            : ""
          }

          ${
            paymentDetails.ifscCode
            ? `<li><strong>IFSC:</strong> ${paymentDetails.ifscCode}</li>`
            : ""
          }

          ${
            paymentDetails.zelle
            ? `<li><strong>Zelle:</strong> ${paymentDetails.zelle}</li>`
            : ""
          }

          ${
            paymentDetails.venmo
            ? `<li><strong>Venmo:</strong> ${paymentDetails.venmo}</li>`
            : "" 
          }

        </ul>

        <hr />

        <p>
          Kindly complete your payment as soon as possible.
        </p>

        <p>
          Thank you 
        </p>

      </div>

      `;

      // SEND EMAIL
      await sendEmail({

        to: order.userId.email,

        subject:
          "Pending Payment Reminder",

        html

      });

      sentEmails.push({

        orderId: order._id,

        email: order.userId.email

      });

    } catch (error) {

      failedEmails.push({

        orderId: order._id,

        email: order.userId?.email || "",

        reason: error.message

      });

    }

  }

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        area,

        citiesCovered: cities,

        totalOrders:
          orders.length,

        totalEmailsSent:
          sentEmails.length,

        totalFailed:
          failedEmails.length,

        sentEmails,

        failedEmails

      },

      "Bulk payment reminders processed successfully"

    )

  );

});


















const getOrderUserDetailsForAdmin = asynchandler(async (req, res) => {

  ensureSuperAdmin(req);
  // get order id
  const { orderId } = req.params;

  // validate order id
  if (!orderId) {

    throw new ApiError(
      400,
      "Order id is required"
    );

  }

  // find order
  const order = await Order.findById(orderId)
    .populate({
      path: "userId",
      select:
        "full_name fullname username email phone_number gender DOB avatar is_email_verified createdAt"
    });

  // check order
  if (!order) {

    throw new ApiError(
      404,
      "Order not found"
    );

  }

  // prepare response
  const responseData = {

    orderId: order._id,

    orderStatus: order.status,

    totalAmount: order.totalAmount,

    deliveryDate: order.deliveryDate,

    payment: order.payment,

    // user details
    user: order.userId,

    // address details
    deliveryDetails: order.deliveryDetails

  };

  return res.status(200).json(

    new ApiResponse(
      200,
      responseData,
      "Order user details fetched successfully"
    )

  );

});











const markOrderAsDelivered = asynchandler(async (req, res) => {

  // ─────────────────────────────────────────────
  // ORDER ID
  // ─────────────────────────────────────────────
  const { orderId } = req.params;

  // ─────────────────────────────────────────────
  // DRIVER
  // ─────────────────────────────────────────────
  const driverId =
    req.staff._id;

  // ─────────────────────────────────────────────
  // VALIDATIONS
  // ─────────────────────────────────────────────
  if (!orderId) {

    throw new ApiError(
      400,
      "Order id is required"
    );
  }

  // ─────────────────────────────────────────────
  // DELIVERY IMAGE LOCAL PATH
  // ─────────────────────────────────────────────
  const deliveryImageLocalPath =
    req.file?.path;

    console.log(req.file);
    
  console.log(deliveryImageLocalPath);
  

  if (!deliveryImageLocalPath) {

    throw new ApiError(
      400,
      "Delivery image is required"
    );
  }

  // ─────────────────────────────────────────────
  // FIND ORDER
  // ─────────────────────────────────────────────
  const order =
    await Order.findById(orderId)

    .populate({

      path: "userId",

      select:
        "full_name username email phone_number"
    });

  if (!order) {

    throw new ApiError(
      404,
      "Order not found"
    );
  }

  // ─────────────────────────────────────────────
  // CHECK ASSIGNED DRIVER
  // ─────────────────────────────────────────────
  if (

    order?.deliveryAssignment?.driverId
      ?.toString() !==
    driverId.toString()

  ) {

    throw new ApiError(
      403,
      "You are not assigned to this order"
    );
  }

  // ─────────────────────────────────────────────
  // UPLOAD IMAGE TO CLOUDINARY
  // ─────────────────────────────────────────────
  const uploadedImage =
    await uploadoncloudinary(
      deliveryImageLocalPath
    );

  if (!uploadedImage?.url) {

    throw new ApiError(
      400,
      "Error while uploading delivery image"
    );
  }

  uploadedImage.url =
    uploadedImage.url.replace(
      /^http:/,
      "https:"
    );

  // ─────────────────────────────────────────────
  // UPDATE ORDER
  // ─────────────────────────────────────────────
  order.status =
    "delivered";

  order.isorderdelivered =
    true;

  order.deliveredAt =
    new Date();

  // ✅ SAVE CLOUDINARY URL
  order.deliveryProofImage =
    uploadedImage.url;

  await order.save();

  // ─────────────────────────────────────────────
  // FIND DELIVERY BATCH
  // ─────────────────────────────────────────────
  const batch =
    await DeliveryBatch.findOne({

      driverId,

      "orders.orderId":
        order._id
    });

  // ─────────────────────────────────────────────
  // FIND SEQUENCE
  // ─────────────────────────────────────────────
  const batchOrder =
    batch?.orders?.find(

      item =>

        item.orderId.toString() ===
        order._id.toString()
    );

  const sequenceNumber =
    batchOrder?.sequence || null;

  // ─────────────────────────────────────────────
  // AREA
  // ─────────────────────────────────────────────
  const area =
    order?.deliveryDetails?.area ||
    order?.deliveryDetails?.city ||
    "Unknown Area";

  // ─────────────────────────────────────────────
  // SEND MAIL TO USER
  // ─────────────────────────────────────────────
  /*
  await sendEmail({

    to: order?.userId?.email,

    subject: "Your Order Has Been Delivered",

    html: `
      <h2>Order Delivered Successfully</h2>

      <p>Hello ${order?.userId?.full_name},</p>

      <p>Your order has been delivered successfully.</p>

      <p>Order Id: ${order?._id}</p>

      <p>Thank you for ordering with us.</p>
    `
  });
  */

  // ─────────────────────────────────────────────
  // SEND MAIL TO ADMIN
  // ─────────────────────────────────────────────
  /*
  await sendEmail({

    to: process.env.ADMIN_EMAIL,

    subject: "Order Delivered Update",

    html: `
      <h2>Order Delivered</h2>

      <p>Order Id: ${order?._id}</p>

      <p>Area: ${area}</p>

      <p>Sequence Number: ${sequenceNumber}</p>

      <p>Driver completed the delivery successfully.</p>
    `
  });
  */

  // ─────────────────────────────────────────────
  // RESPONSE
  // ─────────────────────────────────────────────
  return res.status(200).json(

    new ApiResponse(

      200,

      {

        orderId:
          order._id,

        status:
          order.status,

        deliveredAt:
          order.deliveredAt,

        deliveryProofImage:
          order.deliveryProofImage,

        sequenceNumber,

        area
      },

      "Order marked as delivered successfully"
    )
  );
});








const getAllDeliveryBatches = asynchandler(async (req, res) => {

    // ─────────────────────────────────────────────
    // AUTH
    // ─────────────────────────────────────────────
    ensureSuperAdmin(req);

    // ─────────────────────────────────────────────
    // QUERY PARAMS
    // ─────────────────────────────────────────────
    const {

        status,
        area,
        driverId,

        // DATE FILTERS
        startDate,
        endDate,

        // PAGINATION
        page = 1,
        limit = 10

    } = req.query;

    // ─────────────────────────────────────────────
    // FILTER
    // ─────────────────────────────────────────────
    const filter = {};

    // =====================================================
    // STATUS
    // =====================================================
    if (status) {

        filter.status = status;
    }

    // =====================================================
    // AREA
    // =====================================================
    if (area) {

        filter.area =
            area
                .toLowerCase()
                .trim();
    }

    // =====================================================
    // DRIVER
    // =====================================================
    if (driverId) {

        filter.driverId =
            driverId;
    }

    // =====================================================
    // DATE RANGE
    // =====================================================
    if (
        startDate ||
        endDate
    ) {

        filter.createdAt = {};

        if (startDate) {

            filter.createdAt.$gte =
                new Date(startDate);
        }

        if (endDate) {

            const end =
                new Date(endDate);

            end.setHours(
                23,
                59,
                59,
                999
            );

            filter.createdAt.$lte =
                end;
        }
    }

    // ─────────────────────────────────────────────
    // PAGINATION
    // ─────────────────────────────────────────────
    const currentPage =
        Number(page) || 1;

    const perPage =
        Number(limit) || 10;

    const skip =
        (currentPage - 1) * perPage;

    // ─────────────────────────────────────────────
    // FETCH BATCHES
    // ─────────────────────────────────────────────
    const [batches, totalBatches] =

        await Promise.all([

            DeliveryBatch.find(filter)

                .populate({

                    path: "driverId",

                    select:
                        "name email phone role assignedArea profile_image"
                })

                .populate({

                    path: "orders.orderId",

                    populate: {

                        path: "userId",

                        select:
                            "full_name username email phone_number"
                    }
                })

                .sort({
                    createdAt: -1
                })

                .skip(skip)

                .limit(perPage)

                .lean(),

            DeliveryBatch.countDocuments(
                filter
            )
        ]);

    // ─────────────────────────────────────────────
    // FORMAT RESPONSE
    // ─────────────────────────────────────────────
    const formattedBatches =

        batches.map(batch => ({

            batchId:
                batch._id,

            area:
                batch.area,

            status:
                batch.status,

            finalizedAt:
                batch.finalizedAt,

            createdAt:
                batch.createdAt,

            updatedAt:
                batch.updatedAt,

            // =====================================================
            // DRIVER DETAILS
            // =====================================================
            driver:

                batch.driverId

                    ? {

                        driverId:
                            batch.driverId._id,

                        name:
                            batch.driverId.name,

                        email:
                            batch.driverId.email,

                        phone:
                            batch.driverId.phone,

                        role:
                            batch.driverId.role,

                        assignedArea:
                            batch.driverId.assignedArea,

                        profile_image:
                            batch.driverId.profile_image
                    }

                    : null,

            // =====================================================
            // ORDERS
            // =====================================================
            totalOrders:
                batch.orders.length,

            orders:

                batch.orders.map(
                    item => ({

                        sequence:
                            item.sequence,

                        order:

                            item.orderId

                                ? {

                                    orderId:
                                        item.orderId._id,

                                    status:
                                        item.orderId.status,

                                    totalAmount:
                                        item.orderId.totalAmount,

                                    deliveryDate:
                                        item.orderId.deliveryDate,

                                    isorderdelivered:
                                        item.orderId.isorderdelivered,

                                    payment:
                                        item.orderId.payment,

                                    customer: {

                                        userId:
                                            item.orderId.userId?._id,

                                        name:
                                            item.orderId.userId?.full_name,

                                        username:
                                            item.orderId.userId?.username,

                                        email:
                                            item.orderId.userId?.email,

                                        phone:
                                            item.orderId.userId?.phone_number
                                    },

                                    deliveryDetails:
                                        item.orderId.deliveryDetails,

                                    placedAt:
                                        item.orderId.createdAt
                                }

                                : null
                    }))
        }));

    // ─────────────────────────────────────────────
    // RESPONSE
    // ─────────────────────────────────────────────
    return res.status(200).json(

        new ApiResponse(

            200,

            {

                filters: {

                    status:
                        status || null,

                    area:
                        area || null,

                    driverId:
                        driverId || null,

                    startDate:
                        startDate || null,

                    endDate:
                        endDate || null
                },

                batches:
                    formattedBatches,

                pagination: {

                    totalBatches,

                    currentPage,

                    totalPages:
                        Math.ceil(
                            totalBatches / perPage
                        ),

                    limit:
                        perPage
                }
            },

            "Delivery batches fetched successfully"
        )
    );
});







const setDriverForNextDelivery = asynchandler(async (req, res) => {

    // ─────────────────────────────────────────────
    // ONLY SUPER ADMIN
    // ─────────────────────────────────────────────
    ensureSuperAdmin(req);

    // ─────────────────────────────────────────────
    // PARAMS
    // ─────────────────────────────────────────────
    const { driverId } = req.query;
    console.log(req.query);
    

    // ─────────────────────────────────────────────
    // BODY
    // ─────────────────────────────────────────────
    const {
        upForNextDelivery,
        nextDeliveryDate,
        nextDeliveryNotes
    } = req.body;

    // ─────────────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────────────
    if (!driverId) {

        throw new ApiError(
            400,
            "Driver ID is required"
        );
    }

    // ─────────────────────────────────────────────
    // FIND DRIVER
    // ─────────────────────────────────────────────
    const driver =
        await Employee.findById(driverId);

    if (!driver) {

        throw new ApiError(
            404,
            "Driver not found"
        );
    }

    // ─────────────────────────────────────────────
    // CHECK ROLE
    // ─────────────────────────────────────────────
    if (driver.role !== "driver") {

        throw new ApiError(
            400,
            "Selected employee is not a driver"
        );
    }

    // ─────────────────────────────────────────────
    // UPDATE DRIVER STATUS
    // ─────────────────────────────────────────────
    if (
        typeof upForNextDelivery ===
        "boolean"
    ) {

        driver.upForNextDelivery =
            upForNextDelivery;
    }

    // ─────────────────────────────────────────────
    // SET DELIVERY DATE
    // ─────────────────────────────────────────────
    if (nextDeliveryDate) {

        driver.nextDeliveryDate =
            new Date(nextDeliveryDate);
    }

    // ─────────────────────────────────────────────
    // SET NOTES
    // ─────────────────────────────────────────────
    if (nextDeliveryNotes) {

        driver.nextDeliveryNotes =
            nextDeliveryNotes;
    }

    // ─────────────────────────────────────────────
    // IF REMOVED FROM NEXT DELIVERY
    // RESET DATE + NOTES
    // ─────────────────────────────────────────────
    if (
        upForNextDelivery === false
    ) {

        driver.nextDeliveryDate =
            null;

        driver.nextDeliveryNotes =
            "";
    }

    // ─────────────────────────────────────────────
    // SAVE
    // ─────────────────────────────────────────────
    await driver.save();

    // ─────────────────────────────────────────────
    // RESPONSE
    // ─────────────────────────────────────────────
    return res.status(200).json(

        new ApiResponse(
            200,
            {
                driverId:
                    driver._id,

                name:
                    driver.name,

                email:
                    driver.email,

                upForNextDelivery:
                    driver.upForNextDelivery,

                nextDeliveryDate:
                    driver.nextDeliveryDate,

                nextDeliveryNotes:
                    driver.nextDeliveryNotes
            },

            "Driver next delivery status updated successfully"
        )
    );
});






// controllers/batch.controller.js

const upsertBatch = async (req, res) => {
  try {
    const { driverId, area, orderIds } = req.body;

    // ── Validate input ─────────────────────────────────────────────────
    if (!driverId) {
      return res.status(400).json({ message: "driverId is required" });
    }

    if (!area) {
      return res.status(400).json({ message: "area is required" });
    }

    if (!orderIds?.length) {
      return res.status(400).json({ message: "Select at least one order" });
    }

    // ── 1. Find existing draft batch for this driver + area ────────────
    let batch = await DeliveryBatch.findOne({
      driverId,
      area: area.toLowerCase().trim(),
      status: "draft",
    });

    let isNewBatch = false;

    // ── 2. Determine starting sequence ────────────────────────────────
    const startSequence = batch
      ? Math.max(...batch.orders.map((o) => o.sequence), 0) + 1
      : 1;

    // ── 3. Filter out orders already in this batch (idempotent) ───────
    const existingOrderIds = batch
      ? batch.orders.map((o) => o.orderId.toString())
      : [];

    const newOrderIds = orderIds.filter(
      (id) => !existingOrderIds.includes(id.toString())
    );

    if (!newOrderIds.length) {
      return res.status(409).json({
        message: "All selected orders are already in this batch",
      });
    }

    // ── 4. Verify all orderIds actually exist and are assignable ───────
    const validOrders = await Order.find({
      _id: { $in: newOrderIds },
      "deliveryAssignment.batchId": null,
      status: { $in: ["pending", "confirmed", "preparing"] },
    }).select("_id");

    const validOrderIds = validOrders.map((o) => o._id.toString());

    const invalidIds = newOrderIds.filter(
      (id) => !validOrderIds.includes(id.toString())
    );

    if (invalidIds.length) {
      return res.status(400).json({
        message: "Some orders are invalid or already assigned to another batch",
        invalidIds,
      });
    }

    // ── 5. Build order entries with sequence numbers ───────────────────
    const newOrderEntries = newOrderIds.map((orderId, i) => ({
      orderId,
      sequence: startSequence + i,
    }));

    // ── 6. Upsert the batch ────────────────────────────────────────────
    if (batch) {
      batch.orders.push(...newOrderEntries);
      await batch.save();
    } else {
      isNewBatch = true;
      batch = await DeliveryBatch.create({
        driverId,
        area: area.toLowerCase().trim(),
        status: "draft",
        orders: newOrderEntries,
      });
    }

    // ── 7. Stamp all new orders with batch assignment ──────────────────
    const bulkOps = newOrderEntries.map(({ orderId, sequence }) => ({
      updateOne: {
        filter: { _id: orderId },
        update: {
          $set: {
            "deliveryAssignment.driverId": driverId,
            "deliveryAssignment.assignedToDriverHistory": driverId,
            "deliveryAssignment.batchId": batch._id,
            "deliveryAssignment.deliverySequence": sequence,
            "deliveryAssignment.assignedAt": new Date(),
          },
        },
      },
    }));

    await Order.bulkWrite(bulkOps);

    // ── 8. Fetch populated batch for response ──────────────────────────
    const populatedBatch = await DeliveryBatch.findById(batch._id)
      .populate({
        path: "orders.orderId",
        select:
          "deliveryDetails totalAmount status deliveryAssignment items payment",
      })
      .populate("driverId", "name email phone")
      .lean();

    // ── 9. Shape the response ──────────────────────────────────────────
    const orders = populatedBatch.orders
      .sort((a, b) => a.sequence - b.sequence)
      .map((o) => ({
        sequence: o.sequence,
        orderId: o.orderId._id,
        status: o.orderId.status,
        totalAmount: o.orderId.totalAmount,
        paymentMethod: o.orderId.payment?.method,
        paymentStatus: o.orderId.payment?.status,
        assignedAt: o.orderId.deliveryAssignment?.assignedAt,
        deliveryDetails: {
          addressLine1: o.orderId.deliveryDetails?.addressLine1,
          addressLine2: o.orderId.deliveryDetails?.addressLine2,
          city: o.orderId.deliveryDetails?.city,
          state: o.orderId.deliveryDetails?.state,
          zipCode: o.orderId.deliveryDetails?.zipCode,
          country: o.orderId.deliveryDetails?.country,
          location: o.orderId.deliveryDetails?.location,
          phone: o.orderId.deliveryDetails?.phone,
          instructions: o.orderId.deliveryDetails?.instructions,
        },
      }));

    return res.status(200).json({
      message: isNewBatch
        ? `Batch created with ${newOrderIds.length} order(s)`
        : `${newOrderIds.length} order(s) added to existing batch`,
      batchId: populatedBatch._id,
      isNewBatch,
      driver: populatedBatch.driverId,
      area: populatedBatch.area,
      status: populatedBatch.status,
      totalOrders: populatedBatch.orders.length,
      newOrdersAdded: newOrderIds.length,
      createdAt: populatedBatch.createdAt,
      orders,
    });
  } catch (error) {
    console.error("upsertBatch error:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


export {
        registeruser,
        startEmployeeRegistration,
        getSuperAdminProfile,
        getAllEmployeesByStatus,
        verifyEmployeeRegistration,
        send_otp,
        loginStaff,
        logoutStaff,
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
        adminViewOrdersByArea,
        adminUpdateOrderStatus,
        adminUpdatePaymentStatus,
        getAllUsers,
        kitchenViewOrdersByArea,
        assignAreaToDriver,
        getAllDrivers,
        deleteEmployee,
        getUnverifiedDrivers,
        getAllDriversfull,
        resetAllDrivers,
        createDeliveryBatch,
        getDeliveryBatchDetails,
        reorderDeliveryBatch,
        finalizeDeliveryBatch,
        driverViewMyBatches,
        getUnassignedConfirmedOrders,
        resetConfirmedOrders,
        adminPaymentHistoryByArea,
        sendPaymentReminder,
        sendBulkPaymentRemindersByArea,
        deleteAllOrders,
        getOrderUserDetailsForAdmin,
        markOrderAsDelivered,
        getAllDeliveryBatches,
        editEmployeeDetails,
        setDriverForNextDelivery,
        adminViewDriverBatches,
        unassignSingleOrder,
        assignSingleOrder,
        adminViewBatchesHistory,
        getResetUnDeliveredOrders,
        adminViewDriverBatchHistory,
        upsertBatch
    }
