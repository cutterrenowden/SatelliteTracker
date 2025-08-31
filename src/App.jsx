import SatellitesMap from "./SatellitesMap";
import dataSats from "../../Satellite_C/data.json";

export default function App() {
  return <SatellitesMap satellites={dataSats} />;

}