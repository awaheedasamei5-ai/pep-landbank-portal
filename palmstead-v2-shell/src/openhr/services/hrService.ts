import { employeeService } from "./employee.service";
import { attendanceService } from "./attendance.service";
import { leaveService } from "./leave.service";
import { organizationService } from "./organization.service";
import { shiftService } from "./shift.service";
import { apiClient } from "./api.client";

// Trimmed from OpenHRApp's own hrService.ts facade (which also wires
// auth/review/announcement/superadmin/verification services) to only the
// Attendance + Leave surface this port covers -- per the OSS master
// instruction's "Remove: features that do not serve Palmstead." Palmstead
// has its own real auth (src/stores/auth/auth-store.ts) and no performance
// review / bulk-email / org-registration apps in this item, so those
// service modules were deliberately not copied rather than left as unused
// dead weight. Extend this file, not by re-adding the dropped services, as
// later "twist to fit" work needs more of hrService's surface.
export const hrService = {
  subscribe: apiClient.subscribe.bind(apiClient),
  notify: apiClient.notify.bind(apiClient),

  // Employee
  getEmployees: employeeService.getEmployees,

  // Attendance
  getAttendance: attendanceService.getAttendance,
  getActiveAttendance: attendanceService.getActiveAttendance,
  getActiveAttendanceWithReconciliation: attendanceService.getActiveAttendanceWithReconciliation,
  saveAttendance: attendanceService.saveAttendance,
  updateAttendance: attendanceService.updateAttendance,
  deleteAttendance: attendanceService.deleteAttendance,
  retryPendingSelfies: attendanceService.retryPendingSelfies,
  drainCheckInQueue: attendanceService.drainCheckInQueue,

  // Leaves
  getLeaves: leaveService.getLeaves,
  saveLeaveRequest: leaveService.saveLeaveRequest,
  updateLeaveStatus: leaveService.updateLeaveStatus,
  getLeaveBalance: leaveService.getLeaveBalance,
  adminCreateLeave: leaveService.adminCreateLeave,
  adminUpdateLeave: leaveService.adminUpdateLeave,
  adminDeleteLeave: leaveService.adminDeleteLeave,

  // Organization & Config
  getConfig: organizationService.getConfig,
  setConfig: organizationService.setConfig,
  getDepartments: organizationService.getDepartments,
  setDepartments: organizationService.setDepartments,
  getHolidays: organizationService.getHolidays,
  setHolidays: organizationService.setHolidays,
  getLeavePolicy: organizationService.getLeavePolicy,
  setLeavePolicy: organizationService.setLeavePolicy,
  setStaffLeaveQuotaOverride: organizationService.setStaffLeaveQuotaOverride,
  removeStaffLeaveQuotaOverride: organizationService.removeStaffLeaveQuotaOverride,
  getLeaveTypes: organizationService.getLeaveTypes,
  setLeaveTypes: organizationService.setLeaveTypes,
  getGuideHelpLinks: organizationService.getGuideHelpLinks,

  // Shifts
  getShifts: shiftService.getShifts.bind(shiftService),
  createShift: shiftService.createShift.bind(shiftService),
  updateShift: shiftService.updateShift.bind(shiftService),
  deleteShift: shiftService.deleteShift.bind(shiftService),
  getShiftOverrides: shiftService.getShiftOverrides.bind(shiftService),
  setShiftOverrides: shiftService.setShiftOverrides.bind(shiftService),
  resolveShiftForEmployee: shiftService.resolveShiftForEmployee.bind(shiftService),
};
