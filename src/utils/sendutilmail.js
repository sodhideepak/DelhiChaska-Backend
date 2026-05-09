import nodemailer from "nodemailer";

export const sendEmail = async ({
  to,
  subject,
  html
}) => {

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.emailusername,
      pass: process.env.emailpassword
    }
  });

  await transporter.sendMail({
    from: process.env.emailusername,
    to,
    subject,
    html
  });
};