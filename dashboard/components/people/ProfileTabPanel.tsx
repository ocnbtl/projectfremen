"use client";
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

function Pane(props:HTMLMotionProps<"div">){
 const present=useIsPresent();
 return <motion.div {...props} id={present?props.id:undefined} inert={!present} aria-hidden={!present||undefined}/>;
}
/** Keep the panel frame continuous while content crossfades without stretching text. */
export default function ProfileTabPanel({panelKey,children,...props}:HTMLMotionProps<"div">&{panelKey:string;children:ReactNode}){
 const reduced=useReducedMotion();
 return <motion.div className="people-profile-panel-transition" layout={reduced?false:"size"} transition={{layout:{duration:reduced?0:.22,ease:[.22,1,.36,1]}}}>
  <AnimatePresence initial={false} mode="popLayout">
   <Pane {...props} key={panelKey} layout={reduced?false:"position"} initial={{opacity:reduced?1:0,y:reduced?0:5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-3}} transition={{duration:reduced?0:.18,ease:[.22,1,.36,1]}}>{children}</Pane>
  </AnimatePresence>
 </motion.div>;
}
