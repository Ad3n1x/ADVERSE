export async function sendPasswordResetEmail(email,resetUrl){
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
