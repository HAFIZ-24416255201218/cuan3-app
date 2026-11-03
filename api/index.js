// Vercel Serverless Function entry point
// Vercel hanya mengenali file .js/.ts sebagai Serverless Function (bukan .cjs)
// File ini menjadi wrapper ringan untuk Express app di server/auth-api.cjs
'use strict';

const app = require('../server/auth-api.cjs');
module.exports = app;

