import crypto from 'node:crypto';
import { timingSafeEqual, scryptSync } from 'node:crypto';
import { z } from 'zod';

export function registerAuthRoutes(app, {
  limitAuth, wrap, authSchema, sendError, ownerEmail, isDb, User, memory,
  id, setSession, tokenFor, requireAuth, Investigation, Evidence, Entity,
  Relationship, Watch, Alert, CyberAsset, CyberEvent,
}) {
  app.post('/api/v1/auth/register',limitAuth,wrap(async(req,res)=>{const p=authSchema.safeParse(req.body);if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Use a valid email and a password of at least 12 characters.',p.error.flatten());const email=p.data.email.toLowerCase();if(email===ownerEmail())return sendError(res,403,'OWNER_EMAIL_RESERVED','This email is reserved for the workspace owner. Use administrator sign-in instead.');const existsUser=isDb()?await User.findOne({email}):[...memory.users.values()].find(u=>u.email===email);if(existsUser)return sendError(res,409,'ACCOUNT_EXISTS','An account with this email already exists.');const salt=crypto.randomBytes(16).toString('hex');const passwordHash=salt+':'+scryptSync(p.data.password,salt,64).toString('hex');const user=isDb()?await User.create({email,displayName:p.data.displayName||email.split('@')[0],passwordHash}):{id:id(),email,displayName:p.data.displayName||email.split('@')[0],passwordHash};if(!isDb())memory.users.set(user.id,user);const safe={id:String(user.id||user._id),email:user.email,displayName:user.displayName};setSession(res,tokenFor(safe));res.status(201).json({data:safe});}));
  app.post('/api/v1/auth/login',limitAuth,wrap(async(req,res)=>{const p=authSchema.pick({email:true,password:true}).safeParse(req.body);if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Enter a valid email and password.');const email=p.data.email.toLowerCase();const user=isDb()?await User.findOne({email}).lean():[...memory.users.values()].find(u=>u.email===email);if(!user)return sendError(res,401,'INVALID_CREDENTIALS','Email or password is incorrect.');const [salt,hash]=(user.passwordHash||'').split(':');if(!salt||!hash)return sendError(res,401,'INVALID_CREDENTIALS','Email or password is incorrect.');const candidate=scryptSync(p.data.password,salt,64);const expected=Buffer.from(hash,'hex');if(candidate.length!==expected.length||!timingSafeEqual(candidate,expected))return sendError(res,401,'INVALID_CREDENTIALS','Email or password is incorrect.');const safe={id:String(user.id||user._id),email:user.email,displayName:user.displayName,role:user.role||'user'};setSession(res,tokenFor(safe));res.json({data:safe});}));
  
  const passwordResetRequestSchema=z.object({email:z.string().trim().email().max(254)});
  const passwordResetCompleteSchema=z.object({token:z.string().min(32).max(256),password:z.string().min(12).max(128)});
  async function sendPasswordResetEmail(email,resetUrl){
   const apiKey=String(process.env.BREVO_API_KEY||'').trim();
   const from=String(process.env.BREVO_FROM_EMAIL||'').trim();
   const senderName=String(process.env.BREVO_FROM_NAME||'ADVERSE').trim().slice(0,70)||'ADVERSE';
   if(!apiKey||!from)throw new Error('Brevo password reset delivery is not configured.');
   const safeUrl=String(resetUrl);
   const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':apiKey,'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify({sender:{name:senderName,email:from},to:[{email}],subject:'Reset your ADVERSE password',htmlContent:'<!doctype html><html lang="en"><body style="margin:0;background:#0b0f12;color:#e3e9ee;font-family:Arial,sans-serif;padding:28px"><main style="max-width:520px;margin:auto;background:#111719;border:1px solid #2a3b36;border-radius:12px;padding:28px"><p style="font-size:11px;letter-spacing:2px;color:#8bdcc9">ADVERSE · ACCOUNT SECURITY</p><h1 style="font-size:25px">Reset your password</h1><p style="font-size:15px;line-height:1.7;color:#b6c2c8">We received a request to reset the password for your ADVERSE account. This link expires in 30 minutes and can be used once.</p><p style="margin:28px 0"><a href="'+safeUrl+'" style="display:inline-block;background:#8bdcc9;color:#092019;padding:15px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Reset password</a></p><p style="font-size:12px;line-height:1.7;color:#91a0a6">If the button does not work, copy this link into your browser:<br><a style="color:#8bdcc9;overflow-wrap:anywhere" href="'+safeUrl+'">'+safeUrl+'</a></p><p style="font-size:12px;color:#91a0a6">If you did not request this, you can ignore this email. Your password will not change unless the link is used.</p></main></body></html>',textContent:'Reset your ADVERSE password\n\nOpen this link within 30 minutes to choose a new password:\n'+safeUrl+'\n\nIf you did not request this, ignore this email.'}),signal:AbortSignal.timeout(10000)});
   if(!response.ok){
    const detail=await response.text().catch(()=> '');
    throw new Error('Brevo transactional email returned HTTP '+response.status+(detail?' ('+detail.slice(0,160)+')':'')+'.');
   }
  }
  app.post('/api/v1/auth/forgot-password',limitAuth,wrap(async(req,res)=>{
   const p=passwordResetRequestSchema.safeParse(req.body);
   if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Enter a valid email address.');
   const email=p.data.email.toLowerCase();
   const user=isDb()?await User.findOne({email}):[...memory.users.values()].find(u=>u.email===email);
   if(user){
    const rawToken=crypto.randomBytes(32).toString('base64url');
    const tokenHash=crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt=new Date(Date.now()+30*60*1000);
    if(isDb()){await User.updateOne({_id:user._id},{$set:{passwordResetTokenHash:tokenHash,passwordResetExpiresAt:expiresAt}});}
    else{user.passwordResetTokenHash=tokenHash;user.passwordResetExpiresAt=expiresAt;}
    try{
     const configuredOrigin=String(process.env.WEB_ORIGIN||'').split(',')[0].trim();
     if(!configuredOrigin)throw new Error('WEB_ORIGIN is not configured.');
     const origin=new URL(configuredOrigin);
     if(process.env.NODE_ENV==='production'&&origin.protocol!=='https:')throw new Error('Production password reset links require HTTPS.');
     const resetUrl=new URL('/',origin);resetUrl.searchParams.set('reset',rawToken);
     await sendPasswordResetEmail(email,resetUrl.toString());
    }catch(error){
     if(isDb())await User.updateOne({_id:user._id,passwordResetTokenHash:tokenHash},{$set:{passwordResetTokenHash:'',passwordResetExpiresAt:null}});
     else if(user.passwordResetTokenHash===tokenHash){user.passwordResetTokenHash='';user.passwordResetExpiresAt=null;}
     console.error(JSON.stringify({event:'password_reset_delivery_failed',reason:String(error?.message||'email delivery failed').slice(0,180)}));
    }
   }
   res.json({data:{message:'If an account exists for that email, password reset instructions will be sent shortly.'}});
  }));
  app.post('/api/v1/auth/reset-password',limitAuth,wrap(async(req,res)=>{
   const p=passwordResetCompleteSchema.safeParse(req.body);
   if(!p.success)return sendError(res,400,'VALIDATION_ERROR','Use a valid reset link and a password of at least 12 characters.');
   const tokenHash=crypto.createHash('sha256').update(p.data.token).digest('hex');
   const now=new Date();
   const user=isDb()?await User.findOne({passwordResetTokenHash:tokenHash,passwordResetExpiresAt:{$gt:now}}):[...memory.users.values()].find(u=>u.passwordResetTokenHash===tokenHash&&u.passwordResetExpiresAt&&new Date(u.passwordResetExpiresAt)>now);
   if(!user)return sendError(res,400,'RESET_LINK_INVALID','This password reset link is invalid or expired. Request a new one.');
   const salt=crypto.randomBytes(16).toString('hex');
   const passwordHash=salt+':'+scryptSync(p.data.password,salt,64).toString('hex');
   if(isDb()){
    const updated=await User.updateOne({_id:user._id,passwordResetTokenHash:tokenHash,passwordResetExpiresAt:{$gt:now}},{$set:{passwordHash,passwordResetTokenHash:'',passwordResetExpiresAt:null}});
    if(!updated.modifiedCount)return sendError(res,400,'RESET_LINK_INVALID','This password reset link is invalid or expired. Request a new one.');
   }else{user.passwordHash=passwordHash;user.passwordResetTokenHash='';user.passwordResetExpiresAt=null;}
   res.json({data:{message:'Password updated. You can now sign in with your new password.'}});
  }));
  
  app.get('/api/v1/auth/me',requireAuth,wrap(async(req,res)=>{const user=isDb()?await User.findById(req.user.id).select('email displayName role status').lean():memory.users.get(req.user.id);if(!user)return sendError(res,401,'SESSION_EXPIRED','Please sign in again.');const email=String(user.email||'').toLowerCase();res.json({data:{id:String(user.id||user._id),email:user.email,displayName:user.displayName,role:email===ownerEmail()?'owner':(user.role||'user')}});}));
  app.post('/api/v1/auth/logout',(req,res)=>{res.setHeader('Set-Cookie',`adverse_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);res.status(204).end();});
  app.delete('/api/v1/auth/account',requireAuth,wrap(async(req,res)=>{const uid=String(req.user.id);if(isDb()){const owned=await Investigation.find({ownerId:uid}).select('_id').lean();const ids=owned.map(item=>String(item._id));await Promise.all([Investigation.deleteMany({ownerId:uid}),Evidence.deleteMany({investigationId:{$in:ids}}),Entity.deleteMany({investigationId:{$in:ids}}),Relationship.deleteMany({investigationId:{$in:ids}}),Watch.deleteMany({investigationId:{$in:ids}}),Alert.deleteMany({investigationId:{$in:ids}}),CyberAsset.deleteMany({investigationId:{$in:ids}}),CyberEvent.deleteMany({investigationId:{$in:ids}}),User.deleteOne({_id:uid})]);}else{for(const [iid,item] of memory.investigations)if(String(item.ownerId)===uid){memory.investigations.delete(iid);for(const collection of ['evidence','entities','relationships','watches','alerts','cyberAssets','cyberEvents'])for(const [rid,record] of memory[collection])if(String(record.investigationId)===String(iid))memory[collection].delete(rid);}memory.users.delete(uid);}res.setHeader('Set-Cookie',`adverse_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);res.status(204).end();}));
}
