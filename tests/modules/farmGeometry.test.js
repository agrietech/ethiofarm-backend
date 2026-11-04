const { assertContainedByWoreda, validateFarmPolygon } = require('../../src/modules/farms/farmGeometry');

const woreda = {
  type: 'Polygon',
  coordinates: [
    [
      [39, 8],
      [40, 8],
      [40, 9],
      [39, 9],
      [39, 8],
    ],
  ],
};

const farmInside = {
  type: 'Polygon',
  coordinates: [
    [
      [39.2, 8.2],
      [39.4, 8.2],
      [39.4, 8.4],
      [39.2, 8.4],
      [39.2, 8.2],
    ],
  ],
};

describe('farm geometry validation', () => {
  it('accepts a valid polygon entirely inside its woreda', () => {
    const polygon = validateFarmPolygon(farmInside);
    expect(() => assertContainedByWoreda(polygon, woreda)).not.toThrow();
  });

  it('rejects malformed polygon coordinates', () => {
    expect(() => validateFarmPolygon({ type: 'Polygon', coordinates: [[[39, 8], [40, 8]]] })).toThrow(
      'invalid polygon coordinates'
    );
  });

  it('rejects a polygon outside the selected woreda', () => {
    const outside = {
      ...farmInside,
      coordinates: [
        [
          [40.2, 8.2],
          [40.4, 8.2],
          [40.4, 8.4],
          [40.2, 8.4],
          [40.2, 8.2],
        ],
      ],
    };
    expect(() => assertContainedByWoreda(validateFarmPolygon(outside), woreda)).toThrow(/intersect|entirely within/);
  });

  it('rejects polygon coordinates strictly outside Ethiopia bounding box', () => {
    const outsideEthiopia = {
      type: 'Polygon',
      coordinates: [
        [
          [2.0, 45.0],
          [2.5, 45.0],
          [2.5, 45.5],
          [2.0, 45.5],
          [2.0, 45.0],
        ],
      ],
    };
    expect(() => validateFarmPolygon(outsideEthiopia)).toThrow(/outside Ethiopia/);
  });

  it('rejects self-intersecting polygon boundary (bowtie/kink defect)', () => {
    const selfIntersecting = {
      type: 'Polygon',
      coordinates: [
        [
          [39.2, 8.2],
          [39.4, 8.4],
          [39.4, 8.2],
          [39.2, 8.4],
          [39.2, 8.2],
        ],
      ],
    };
    expect(() => validateFarmPolygon(selfIntersecting)).toThrow(/must not self-intersect/);
  });

  it('automatically auto-closes an unclosed linear ring', () => {
    const unclosed = {
      type: 'Polygon',
      coordinates: [
        [
          [39.2, 8.2],
          [39.4, 8.2],
          [39.4, 8.4],
          [39.2, 8.4],
        ],
      ],
    };
    const validated = validateFarmPolygon(unclosed);
    const coords = validated.geometry.coordinates[0];
    expect(coords[0]).toEqual(coords[coords.length - 1]);
  });

  it('auto-corrects inverted [lat, lng] coordinates to standard GeoJSON [lng, lat]', () => {
    // In Ethiopia: Lat is ~3 to ~15, Lng is ~33 to ~48
    // Inverted: [8.2, 39.2] instead of [39.2, 8.2]
    const inverted = {
      type: 'Polygon',
      coordinates: [
        [
          [8.2, 39.2],
          [8.2, 39.4],
          [8.4, 39.4],
          [8.4, 39.2],
          [8.2, 39.2],
        ],
      ],
    };
    const validated = validateFarmPolygon(inverted);
    const coords = validated.geometry.coordinates[0];
    expect(coords[0][0]).toBeCloseTo(39.2);
    expect(coords[0][1]).toBeCloseTo(8.2);
  });
});
