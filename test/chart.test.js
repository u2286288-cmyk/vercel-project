const {test}=require('node:test');
const assert=require('node:assert/strict');
const {nearestPoint,exactPrice}=require('../public/chart-hints');
test('chart hit testing selects actual samples and clamps edges',()=>{
  assert.equal(nearestPoint(0,720,169),0);
  assert.equal(nearestPoint(360,720,169),84);
  assert.equal(nearestPoint(720,720,169),168);
  assert.equal(nearestPoint(-100,720,169),0);
  assert.equal(nearestPoint(900,720,169),168);
  assert.equal(nearestPoint(0,0,169),0);
});
test('tooltip retains provider precision for high and tiny prices',()=>{
  assert.equal(exactPrice(75254.123456789),'75,254.123456789 USD');
  assert.equal(exactPrice(0.000000123456789),'0.000000123456789 USD');
  assert.equal(exactPrice(0),'0 USD');
});
