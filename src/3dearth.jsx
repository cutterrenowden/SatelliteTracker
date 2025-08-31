import * as THREE from "three"
import React from "react"
import {Canvas, useFrame } from "@react-three/fiber"
import {OrbitControls } from "@react-three/drei"
import Nebula from "./Nebula"
import Starfield from Starfield

function IcoSphere(){
    const icoRef = React.useRef();

    useFrame(() => {
        icoRef.current.rotation.x = 0;
        icoRef.current.rotation.y = 0;
    });
    return (
        <mesh ref={icoRef}>
        <icosahedronGeometry />
        <meshStandardMaterial color={0xffff00} />
        </mesh>
    );
}

function App() {
    return (
        <Canvas gl={{ toneMapping: THREE.NoToneMapping}}>
            <IcoSphere />
            <hemisphereLight args={[0xffffff, 0x000000]} />
            <Nebula />
            <Starfield />
            <OrbitControls /> 
        </Canvas>
    );
}