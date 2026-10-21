/**
 * Unit Tests for InfraScan Core Engineering Rules Helpers
 * 
 * Verifies:
 * 1. Rule 3: formatMeasurement (px vs mm, uncalibrated scaling tags)
 * 2. Rule 4: evaluateProgression (progression gate, calibration/viewpoint requirements)
 * 3. Rule 2 & 5: getSeverityMeta (forbidden safety terms, absence of damage wording)
 * 4. Rule 6: canRoleAccessRoute (Role-based access matrix)
 */

import {
  formatMeasurement,
  evaluateProgression,
  getSeverityMeta,
  getFindingReviewBadge,
  canRoleAccessRoute,
} from "./rules";

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  FAIL: ${testName}`);
      failed++;
    }
  }

  console.log("=== Running InfraScan Engineering Rules Unit Tests ===");

  // 1. Rule 3: formatMeasurement
  console.log("\n[Test Suite 1: Rule 3 - Pixels vs Millimetres]");
  {
    const uncalibrated = formatMeasurement(412, null);
    assert(uncalibrated.unit === "px", "Null mm_per_pixel outputs px unit");
    assert(!uncalibrated.isCalibrated, "isCalibrated is false when mm_per_pixel is null");
    assert(uncalibrated.annotation === "not calibrated", "Includes 'not calibrated' annotation");
    assert(uncalibrated.label.includes("412 px (not calibrated)"), "Label contains '412 px (not calibrated)'");

    const calibrated = formatMeasurement(400, 0.05); // 400 * 0.05 = 20.00 mm
    assert(calibrated.unit === "mm", "Calibrated scale outputs mm unit");
    assert(calibrated.isCalibrated, "isCalibrated is true when scale exists");
    assert(calibrated.displayValue === "20.00", "Calculates correct millimeters");
    assert(calibrated.annotation === null, "No warning annotation when calibrated");
  }

  // 2. Rule 4: evaluateProgression
  console.log("\n[Test Suite 2: Rule 4 - Progression Comparison Gate]");
  {
    // Both uncalibrated -> MUST warn and NOT output percentage change
    const uncalibratedProg = evaluateProgression(412, 320, false, false, true, true);
    assert(!uncalibratedProg.canCompare, "canCompare is false when uncalibrated");
    assert(uncalibratedProg.changePercent === null, "changePercent is null without calibration");
    assert(uncalibratedProg.warningNotice !== null, "Warning notice is provided");
    assert(uncalibratedProg.changeText === "+92 px", "Outputs raw pixel delta (+92 px)");

    // Different viewpoints -> MUST warn
    const differentViewpoint = evaluateProgression(412, 320, true, true, false, true);
    assert(!differentViewpoint.canCompare, "canCompare is false when viewpoints differ");
    assert(differentViewpoint.warningNotice?.includes("Viewpoints differ") || false, "Detects viewpoint mismatch");

    // Both calibrated, registered, matching viewpoints -> valid percentage
    const validProg = evaluateProgression(400, 300, true, true, true, true);
    assert(validProg.canCompare, "canCompare is true when fully calibrated and aligned");
    assert(validProg.changePercent === 33.3, "Calculates +33.3% growth correctly");
    assert(validProg.changeText === "+33.3%", "Outputs formatted change text");
    assert(validProg.warningNotice === null, "No warning notice when compliant");
  }

  // 3. Rule 2 & 5: Severity Wording & Absence of Defects
  console.log("\n[Test Suite 3: Rule 2 & 5 - Severity Safety Terminology]");
  {
    const critical = getSeverityMeta("critical");
    assert(critical.label === "Critical / Requires Urgent Engineering Review", "Critical wording avoids 'unsafe'/'dangerous'");
    assert(!critical.label.toLowerCase().includes("unsafe"), "Does NOT contain 'unsafe'");
    assert(!critical.label.toLowerCase().includes("collapse"), "Does NOT contain 'collapse'");

    const none = getSeverityMeta("none");
    assert(none.label === "No defects detected by AI in reviewed images", "Absence of defects uses precise non-destructive wording");
    assert(!none.label.toLowerCase().includes("all clear"), "Does NOT say 'all clear'");
  }

  // 4. Rule 1: AI Decision Support Labels
  console.log("\n[Test Suite 4: Rule 1 - AI Decision Support Dispositions]");
  {
    const aiSuggestion = getFindingReviewBadge("ai_suggestion");
    assert(aiSuggestion.label === "AI suggestion", "Unreviewed detections labeled 'AI suggestion'");
    assert(!aiSuggestion.isEngineerApproved, "Not marked approved");

    const confirmed = getFindingReviewBadge("confirmed");
    assert(confirmed.label === "Engineer confirmed", "Reviewed findings labeled 'Engineer confirmed'");
    assert(confirmed.isEngineerApproved, "Marked as engineer approved");
  }

  // 5. Rule 6: Role Route Permission Matrix
  console.log("\n[Test Suite 5: Rule 6 - Role-Based Access Control Matrix]");
  {
    assert(canRoleAccessRoute("inspector", "/dashboard/inspector"), "Inspector can access inspector dashboard");
    assert(!canRoleAccessRoute("inspector", "/dashboard/admin"), "Inspector cannot access admin dashboard");
    assert(canRoleAccessRoute("engineer", "/dashboard/engineer"), "Engineer can access engineer dashboard");
    assert(canRoleAccessRoute("manager", "/dashboard/damage-map"), "Manager can access damage map");
    assert(canRoleAccessRoute("admin", "/dashboard/admin"), "Admin can access admin dashboard");
    assert(canRoleAccessRoute("admin", "/dashboard/inspector"), "Admin can access all dashboards");
  }

  console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===\n`);
  return failed === 0;
}

runTests();
