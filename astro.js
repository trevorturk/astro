"use strict";

// Jean Meeus, "Astronomical Algorithms, 2nd Ed.", p. 147.
// radians
function obliquity(time) {
  return 0.412994 - 4121e-18 * time;
}

// http://aa.usno.navy.mil/faq/docs/GAST.php
// hours
function gmst(time) {
  return 6.699851 + 278538308153e-18 * time;
}

// http://stjarnhimlen.se/comp/ppcomp.html#13
// degrees
function parallax(distance) {
  return 2443e-6 / distance;
}

class Observer {
  constructor(planet, lat, lon) {
    const sin_lat = Math.sin(lat * (Math.PI / 180));
    const cos_lat = Math.cos(lat * (Math.PI / 180));

    const dec = planet.declination;
    const sin_dec = Math.sin(dec * (Math.PI / 180));
    const cos_dec = Math.cos(dec * (Math.PI / 180));

    const ha = planet.hour_angle(lon);
    const sin_ha = Math.sin(ha * (Math.PI / 12));
    const cos_ha = Math.cos(ha * (Math.PI / 12));

    // calculate geocentric horizontal coordinates
    const sin_altitude = sin_lat * sin_dec + cos_lat * cos_dec * cos_ha;
    const cos_altitude = Math.sqrt(1 - sin_altitude * sin_altitude);
    const azimuth = Math.atan2(cos_dec * sin_ha, sin_lat * cos_dec * cos_ha - cos_lat * sin_dec) * (180 / Math.PI) + 180;

    // apply parallax for topocentric horizontal coordinates
    // http://stjarnhimlen.se/comp/ppcomp.html#13
    const altitude = Math.asin(sin_altitude) * (180 / Math.PI) - parallax(planet.distance) * cos_altitude;

    // initialize this object
    this.altitude = altitude;
    this.azimuth = azimuth;
  }
}

class Planet {
  constructor(time) {
    this.setTime(time);
  }

  // https://ssd.jpl.nasa.gov/?planet_pos
  // abstract
  setTime(time, a, e, i, λ, π, Ω) {
    const M = λ - π;
    const w = π - Ω;

    // solve Kepler's equation
    let E = M + e * Math.sin(M);
    for(;;) {
      const dM = M - (E - e * Math.sin(E));
      const dE = dM / (1 - e * Math.cos(E));
      E += dE;

      if(Math.abs(dE) <= 1e-8) {
        break;
      }
    }

    // in-plane coordinates
    const u = a * (Math.cos(E) - e);
    const v = a * Math.sqrt(1 - e * e) * Math.sin(E);

    // ecliptic coordinates
    const sin_i = Math.sin(i);
    const cos_i = Math.cos(i);
    const sin_Ω = Math.sin(Ω);
    const cos_Ω = Math.cos(Ω);
    const sin_w = Math.sin(w);
    const cos_w = Math.cos(w);
    const x = u * (cos_w * cos_Ω - sin_w * sin_Ω * cos_i) + v * (-sin_w * cos_Ω - cos_w * sin_Ω * cos_i);
    const y = u * (cos_w * sin_Ω + sin_w * cos_Ω * cos_i) + v * (-sin_w * sin_Ω + cos_w * cos_Ω * cos_i);
    const z = u * (sin_w * sin_i) + v * (cos_w * sin_i);

    // initialize this object
    this.time = time;
    this.x = x;
    this.y = y;
    this.z = z;
  }

  // https://www.aa.quae.nl/en/reken/hemelpositie.html#1_6
  // AU
  get distance() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  // http://stjarnhimlen.se/comp/ppcomp.html#7
  // degrees
  get longitude() {
    return Math.atan2(-this.y, -this.x) * (180 / Math.PI) + 180;
  }

  // https://www.aa.quae.nl/en/reken/hemelpositie.html#1_6
  // degrees
  get latitude() {
    return Math.asin(this.z / this.distance) * (180 / Math.PI);
  }

  // http://stjarnhimlen.se/comp/ppcomp.html#12
  // hours
  get right_ascension() {
    const e = obliquity(this.time);
    return Math.atan2(this.z * Math.sin(e) - this.y * Math.cos(e), -this.x) * (12 / Math.PI) + 12;
  }

  // same as ecliptic latitude, but in equatorial coordinates
  // https://www.aa.quae.nl/en/reken/hemelpositie.html#1_6
  // http://stjarnhimlen.se/comp/ppcomp.html#12
  // degrees
  get declination() {
    const e = obliquity(this.time);
    return Math.asin((this.y * Math.sin(e) + this.z * Math.cos(e)) / this.distance) * (180 / Math.PI);
  }

  // https://www.aa.quae.nl/en/reken/hemelpositie.html#1_9
  // hours
  hour_angle(lon) {
    const ha = gmst(this.time) + lon * (1 / 15) - this.right_ascension;
    return ha - Math.floor(ha / 24) * 24;
  }

  // http://stjarnhimlen.se/comp/riset.html
  // NOTE: latitude not used, but kept for consistency with rise/set
  // timestamp
  transit(lat, lon) {
    let ha = this.hour_angle(lon);
    if(ha > 12) { ha -= 24; }

    return this.time - 3590170.4 * ha;
  }

  // http://stjarnhimlen.se/comp/riset.html
  // timestamp
  riseset(lat, lon, h0, direction) {
    // save state
    const {time, x, y, z} = this;

    const sin_lat = Math.sin(lat * (Math.PI / 180));
    const cos_lat = Math.cos(lat * (Math.PI / 180));

    const sin_h0 = Math.sin(h0 * (Math.PI / 180));

    for(;;) {
      // solve the sunrise equation
      const dec = this.declination;
      const sin_dec = Math.sin(dec * (Math.PI / 180));
      const cos_dec = Math.cos(dec * (Math.PI / 180));
      const cos_lha = (sin_h0 - sin_lat * sin_dec) / (cos_lat * cos_dec);
      // FIXME: would be nicer to try hunting for the appropriate time
      if(Math.abs(cos_lha) > 1) {
        // restore state
        this.time = time;
        this.x = x;
        this.y = y;
        this.z = z;

        // bail
        return NaN;
      }

      // calculate the candidate rise or set time
      const riseset = this.transit(lat, lon) + 13713440.9 * direction * Math.acos(cos_lha);

      // if the candidate is far enough from the current time, we might be
      // inaccurate. update the this's time, and iterate
      if(Math.abs(riseset - this.time) >= 60000) {
        this.setTime(riseset);
        continue;
      }

      // otherwise, we're done!

      // restore state
      this.time = time;
      this.x = x;
      this.y = y;
      this.z = z;

      // return
      return riseset;
    }
  }

  // convenience method for the above
  // timestamp
  rise(lat, lon) {
    return this.riseset(lat, lon, 0, -1);
  }

  // convenience method for the above
  // timestamp
  set(lat, lon) {
    return this.riseset(lat, lon, 0, +1);
  }

  // object
  observer(lat, lon) {
    return new Observer(this, lat, lon);
  }
}

// The Kepler element formulae below are all from J. L. Simon _et. al._,
// "Numerical expressions for precession formulae and mean elements for the
// Moon and planets," 1992.
class Sun extends Planet {
  setTime(time) {
    super.setTime(
      time,
      1.000001,
      0.016721 -        13e-18 * time,
      0,
      4.891045 + 199106385e-18 * time,
      4.929185 +      9510e-18 * time,
      0,
    );
  }

  dawn(lat, lon) {
    return this.riseset(lat, lon, -6, -1);
  }

  rise(lat, lon) {
    return this.riseset(lat, lon, -0.833, -1);
  }

  set(lat, lon) {
    return this.riseset(lat, lon, -0.833, +1);
  }

  dusk(lat, lon) {
    return this.riseset(lat, lon, -6, +1);
  }
}

class Moon extends Planet {
  setTime(time) {
    super.setTime(
      time,
      0.002563,
      0.055546,
      0.090001,
      3.455090 + 2661707199e-18 * time,
      5.282226 +   22504146e-18 * time,
      6.026367 -   10696962e-18 * time,
    );
  }

  // http://stjarnhimlen.se/comp/riset.html#4
  rise(lat, lon) {
    return this.riseset(lat, lon, -0.583 - parallax(this.distance), -1);
  }

  // http://stjarnhimlen.se/comp/riset.html#4
  set(lat, lon) {
    return this.riseset(lat, lon, -0.583 - parallax(this.distance), +1);
  }
}

exports.sun  = time => new Sun (time);
exports.moon = time => new Moon(time);
