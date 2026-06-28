declare const data: {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      id: "stuttgart-stadtkreis" | "landkreis-esslingen";
      name: string;
      [key: string]: unknown;
    };
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
  }>;
};

export default data;
