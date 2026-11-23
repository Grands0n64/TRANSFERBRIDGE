// Scout email access is paused until TRANSFERBRIDGE selects a supported payment provider.
// No payment provider, checkout, or currency is active in this endpoint.
module.exports = async (req,res) => {
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed."});
 if(req.body?.action==="initialize")return res.status(503).json({error:"Scout email unlocking is temporarily unavailable while TRANSFERBRIDGE finalises its payment provider."});
 if(req.body?.action==="status")return res.status(200).json({unlocked:[]});
 return res.status(400).json({error:"Unsupported action."});
};
