import multer from "multer";

// function to store file on disckstorage using multer basically images/videos 
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "./public/temp")
    },
    filename: function (req, file, cb) {
     
      cb(null, file.originalname)
    }
  })
  
  
  
export const upload = multer({ 
    storage 
})
