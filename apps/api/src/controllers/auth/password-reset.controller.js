import crypto from 'node:crypto';
import { scryptSync } from 'node:crypto';
import { z } from 'zod';

/**
 * Password-reset request handlers. Route registration, rate limiting, and
 * async error wrapping remain in auth.routes.js.
 */
export function createPasswordResetController({ isDb, User, memory, sendError, sendPasswordResetEmail }) {
  const passwordResetRequestSchema = z.object({ email: z.string().trim().email().max(254) });
  const passwordResetCompleteSchema = z.object({ token: z.string().min(32).max(256), password: z.string().min(12).max(128) });

  async function forgotPassword(req, res) {
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
  
  }

  async function resetPassword(req, res) {
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
  
  }

  return { forgotPassword, resetPassword };
}
