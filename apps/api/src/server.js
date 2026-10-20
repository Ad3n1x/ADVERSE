import 'dotenv/config';
import mongoose from 'mongoose';
import { app } from './app.js';
const port=Number(process.env.PORT||4000);
if(process.env.NODE_ENV==='production'&&!process.env.JWT_SECRET)throw new Error('JWT_SECRET is required in production; refusing to start with a predictable session secret.');
if(process.env.MONGODB_URI){
  try{await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});globalThis.__ADVERSE_MONGO_READY__=true;console.log('ADVERSE MongoDB connected');}
  catch(error){globalThis.__ADVERSE_MONGO_READY__=false;console.error('MongoDB unavailable; API will use ephemeral memory storage:',error.message);}
}else{globalThis.__ADVERSE_MONGO_READY__=false;console.warn('MONGODB_URI not set; data will be ephemeral and lost on restart.');}
app.listen(port,'0.0.0.0',()=>console.log(`ADVERSE API listening on ${port}`));
