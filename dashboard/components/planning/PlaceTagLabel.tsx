"use client";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { placeTagIconRole } from "../../lib/modules/planning/place-tags";
import styles from "./PlaceTagLabel.module.css";

export default function PlaceTagLabel({tag,className=""}:{tag:string;className?:string}) {
  return <span className={`${styles.label} ${className}`}><UnigentamosIcon role={placeTagIconRole(tag)} size={15}/>{tag}</span>;
}
