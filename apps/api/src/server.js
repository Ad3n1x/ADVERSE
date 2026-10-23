import 'dotenv/config';
import mongoose from 'mongoose';
import { app } from './app.js';
import { startMonitoringWorker } from './monitor.js';
import { startDiscoveryWorker } from './discovery.js';
import { Investigation } from './models.js';
import { PublicSearchDocument } from './models/public-search-document.model.js';
import { interruptedAgentState } from './agent-run-state.js';
const port=Number(process.env.PORT||4000);
if(process.env.NODE_ENV==='production'&&!process.env.JWT_SECRET)throw new Error('JWT_SECRET is required in production; refusing to start with a predictable session secret.');
if(process.env.NODE_ENV==='production'&&!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required in production; refusing to start with ephemeral data storage.');
if(process.env.MONGODB_URI){
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:12000});
  globalThis.__ADVERSE_MONGO_READY__=true;
  console.log('ADVERSE MongoDB connected');
  await PublicSearchDocument.createIndexes().catch(error => {
    console.warn('ADVERSE public search index initialization deferred:', String(error?.message || 'index creation failed').slice(0, 180));
  });
}else{globalThis.__ADVERSE_MONGO_READY__=false;console.warn('MONGODB_URI not set; local development data is ephemeral.');}
if(globalThis.__ADVERSE_MONGO_READY__===true){
  const stale=await Investigation.find({'agentRunState.status':'running'}).select('_id agentRunState').lean();
  let recovered=0;
  for(const item of stale){
    const next=interruptedAgentState(item.agentRunState);
    if(!next)continue;
    const result=await Investigation.updateOne({_id:item._id,'agentRunState.runId':item.agentRunState?.runId,'agentRunState.status':'running'},{$set:{agentRunState:next}});
    recovered+=Number(result.modifiedCount||0);
  }
  if(recovered)console.warn('ADVERSE recovered '+recovered+' interrupted investigation run(s); rerun them to continue.');
}
app.listen(port,'0.0.0.0',()=>{console.log('ADVERSE API listening on '+port);startMonitoringWorker();startDiscoveryWorker();});
