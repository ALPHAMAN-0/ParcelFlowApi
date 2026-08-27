import * as parcelsService from './parcels.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function create(req, res) {
  const parcel = await parcelsService.createParcel(req.validated.body, req.user);
  return sendSuccess(res, 201, parcel);
}

export async function list(req, res) {
  const { items, meta } = await parcelsService.listParcels(req.validated.query, req.user);
  return sendSuccess(res, 200, items, meta);
}

export async function getByTrackingCode(req, res) {
  const parcel = await parcelsService.getByTrackingCode(req.validated.params.trackingCode, req.user);
  return sendSuccess(res, 200, parcel);
}

export async function history(req, res) {
  const result = await parcelsService.getHistory(req.validated.params.id, req.user);
  return sendSuccess(res, 200, result);
}

export async function updateStatus(req, res) {
  const parcel = await parcelsService.updateStatus(req.validated.params.id, req.validated.body.status, req.user);
  return sendSuccess(res, 200, parcel);
}

export async function assign(req, res) {
  const parcel = await parcelsService.assignStaff(req.validated.params.id, req.validated.body.staffId);
  return sendSuccess(res, 200, parcel);
}