
// import { asynchandler } from "../utils/asynchandler.js";
// import { ApiResponse } from "../utils/ApiResponse.js";
// import { ApiError } from "../utils/ApiError.js";

// export const getNextDeliveryDate = (
//   baseDate = new Date()
// ) => {

//   // Monday & Thursday
//   const deliveryDays = [1, 4];

//   // Convert to US Pacific Time
//   const usDate = new Date(
//     baseDate.toLocaleString(
//       "en-US",
//       {
//         timeZone:
//           "America/Los_Angeles"
//       }
//     )
//   );

//   const today =
//     usDate.getDay();

//   let daysToAdd = null;

//   // Find next delivery day
//   for (
//     let i = 1;
//     i <= 7;
//     i++
//   ) {

//     const nextDay =
//       (today + i) % 7;

//     if (
//       deliveryDays.includes(nextDay)
//     ) {

//       daysToAdd = i;
//       break;
//     }
//   }

//   // Create next delivery date
//   const nextDeliveryDate =
//     new Date(usDate);

//   nextDeliveryDate.setDate(
//     usDate.getDate() + daysToAdd
//   );

//   return nextDeliveryDate;
// };