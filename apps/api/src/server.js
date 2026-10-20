import 'dotenv/config';
import mongoose from 'mongoose';
import { app } from './app.js';
import { startMonitoringWorker } from './monitor.js';
import { startDiscoveryWorker } from './discovery.js';
const port=Number(process.env.PORT||4000);
if(process.env.NODE_ENV==='production'&&!process.env.JWT_SECRET)throw new Error('JWT_SECRET is required in production; refusing to start with a predictable session secret.');
if(process.env.NODE_ENV==='production'&&!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required in production; refusing to start with ephemeral data storage.');
if(process.env.MONGODB_URI){
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:12000});
  globalThis.__ADVERSE_MONGO_READY__=true;
  console.log('ADVERSE MongoDB connected');
}else{globalThis.__ADVERSE_MONGO_READY__=false;console.warn('MONGODB_URI not set; local development data is ephemeral.');}
app.listen(port,'0.0.0.0',()=>{console.log('ADVERSE API listening on '+port);startMonitoringWorker();startDiscoveryWorker();});
