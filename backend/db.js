const mongoose = require("mongoose");
const mongoURI = "mongodb://localhost:27017/FaceRecog";
// const mongoURI = "mongodb+srv://AA_Reddy:amshu%402006@facerecog-cluster0.dwdnv.mongodb.net/FaceRecog?retryWrites=true&w=majority&appName=FaceRecog-Cluster0";

const connectToMongo = async ()=>{
    await mongoose.connect(mongoURI);
    console.log("Connected to MongoDB successfully.");
}

module.exports = connectToMongo;