function ascii(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
}
function pdfEscape(value) { return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function wrap(value, width=88) {
  const words=ascii(value).split(/\s+/);const lines=[];let line='';
  for(const word of words){if(!word)continue;if((line+' '+word).trim().length>width){if(line)lines.push(line);line=word;}else line=(line+' '+word).trim();}
  if(line)lines.push(line);return lines.length?lines:[''];
}
export function createReportPdf(report) {
  const lines=[];
  lines.push('ADVERSE | EVIDENCE-FIRST INVESTIGATION REPORT','Generated: '+report.generatedAt,'Investigation: '+(report.investigation?.title||'Untitled investigation'));
  lines.push('Question: '+(report.investigation?.question||'Not supplied'),'Status: '+(report.investigation?.status||'unknown'),'');
  lines.push('SUMMARY','Evidence records: '+(report.summary?.evidenceCount||0),'Entities: '+(report.summary?.entityCount||0),'Relationships: '+(report.summary?.relationshipCount||0),'');
  lines.push('EVIDENCE RECORDS');
  for(const e of report.evidence||[]){lines.push(...wrap('Title: '+e.title),...wrap('Source: '+e.url),...wrap('Publisher: '+(e.publisher||'Not recorded')+' | Status: '+(e.verificationStatus||'unverified')), ...wrap('Published: '+(e.publishedAt||'unknown')+' | Retrieved: '+(e.retrievedAt||'unknown')+' | Capture: '+(e.captureTimestamp||'unknown')),...wrap('Excerpt: '+(e.excerpt||'No excerpt stored')), '');}
  lines.push('ENTITIES');
  for(const e of report.entities||[])lines.push(...wrap((e.name||'Unnamed')+' ['+(e.type||'entity')+'] — '+(e.description||'No description')), ...wrap('Canonical URL: '+(e.canonicalUrl||'not recorded')), '');
  lines.push('DOCUMENTED RELATIONSHIPS');
  for(const r of report.relationships||[])lines.push(...wrap((r.fromEntityId||'?')+' --'+(r.type||'associated')+'--> '+(r.toEntityId||'?')), ...wrap('Status: '+(r.verificationStatus||'unverified')+' | Confidence: '+(r.confidence||'low')+' | Evidence IDs: '+((r.evidenceIds||[]).join(', ')||'none')), ...wrap('Rationale: '+(r.rationale||'Not supplied')), '');
  lines.push('LIMITATIONS');
  for(const item of report.limitations||[])lines.push(...wrap('- '+item));
  lines.push('This report contains stored research records, not a finding of truth, wrongdoing, causation, or common ownership. Verify original sources independently.');
  const wrapped=lines.flatMap(line=>wrap(line,92));
  const pages=[];for(let i=0;i<wrapped.length;i+=48)pages.push(wrapped.slice(i,i+48));if(!pages.length)pages.push(['ADVERSE report']);
  const objects=[];const add=(s)=>{objects.push(s);return objects.length;};
  const catalogId=add('');const pagesId=add('');const fontId=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds=[];
  for(const pageLines of pages){let stream='BT\n/F1 9 Tf\n46 800 Td\n13 TL\n';for(const line of pageLines)stream+='('+pdfEscape(line)+') Tj\nT*\n';stream+='ET';
    const streamId=add('<< /Length '+Buffer.byteLength(stream,'ascii')+' >>\nstream\n'+stream+'\nendstream');
    const pageId=add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 '+fontId+' 0 R >> >> /Contents '+streamId+' 0 R >>');pageIds.push(pageId);}
  objects[catalogId-1]='<< /Type /Catalog /Pages '+pagesId+' 0 R >>';
  objects[pagesId-1]='<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
  let pdf='%PDF-1.4\n%ADVERSE\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf,'ascii'));pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
  const xref=Buffer.byteLength(pdf,'ascii');pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root '+catalogId+' 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return Buffer.from(pdf,'ascii');
}
