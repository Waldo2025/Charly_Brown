const { resolveAuthContext } = require('./common.js');
const { createScienceProductionCoordinator } = require('./science-production-coordinator.js');
function registerScienceProductionRoutes(app,dependencies={}){
  const coordinator=dependencies.coordinator||createScienceProductionCoordinator(dependencies),authenticate=dependencies.resolveAuthContext||resolveAuthContext;
  const route=handler=>async(req,res)=>{try{const auth=await authenticate(req);if(!auth?.uid)throw Object.assign(new Error('auth_required'),{status:401});await handler(req,res,auth);}catch(error){res.status(Number(error.status)||500).json({error:String(error.message||'science_production_failed')});}};
  const base='/api/science-activities/production';
  app.get(base,route(async(req,res,auth)=>res.json({runs:await coordinator.store.list(auth.uid)})));
  app.post(`${base}/plan`,route(async(req,res,auth)=>res.status(202).json({run:await coordinator.plan(auth.uid,req.body?.config,req.body?.activity)})));
  app.get(`${base}/:runId`,route(async(req,res,auth)=>res.json({run:await coordinator.status(auth.uid,req.params.runId)})));
  for(const action of ['revise','approve','start','cancel','retry','regenerate_asset','validate_activity'])app.post(`${base}/:runId/${action}`,route(async(req,res,auth)=>res.json({run:await coordinator.control(auth.uid,req.params.runId,action,req.body||{})})));
  return coordinator;
}
module.exports={registerScienceProductionRoutes};
