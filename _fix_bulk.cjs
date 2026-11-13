const fs=require('fs');
const p='backend/src/routes/assessments.js';
let t=fs.readFileSync(p,'utf8');
if(t.includes('marks/bulk')){console.log('exists');process.exit(0)}
const m="  /**\n   * 12. Assessment Audit Trail\n   */";
if(!t.includes(m)){console.error('no');process.exit(1)}
const b=fs.readFileSync('_tmp_bulk.txt','utf8').replace(/^\uFEFF/,''); // _tmp_bulk.txt was deleted earlier; recreate inline
