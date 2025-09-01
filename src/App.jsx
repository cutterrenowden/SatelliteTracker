import SatellitesMap from "./SatellitesMap";
import dataSats from "/public/data.json";

export default function App() {
  return <SatellitesMap satellites={dataSats} />;

}
