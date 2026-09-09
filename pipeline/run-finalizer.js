export const isFinalRun=state=>Boolean(state?.completedRun)&&state?.runState==='COMPLETE';
