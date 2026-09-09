export const canUseCurrentResults=state=>state.runState==='COMPLETE'&&Boolean(state.completedRun);
export const isStale=state=>state.runState==='INVALIDATED';
export const activeScope=state=>state.presentation?.scope??null;
