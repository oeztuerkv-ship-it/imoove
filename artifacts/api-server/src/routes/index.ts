import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ridesRouter from "./rides";
import authRouter from "./auth";
import adminApiRouter from "./adminApi";
import panelAuthRouter from "./panelAuth";
import panelApiRouter from "./panelApi";
import fleetAuthRouter from "./fleetAuth";
import fleetDriverApiRouter from "./fleetDriverApi";
import fleetPanelApiRouter from "./fleetPanelApi";
import insurerPanelApiRouter from "./insurerPanelApi";
import publicHomepageApiRouter from "./publicHomepageApi";
import appConfigApiRouter from "./appConfigApi";
import customerApiRouter from "./customerApi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(appConfigApiRouter);
router.use(authRouter);
router.use(panelAuthRouter);
router.use(fleetAuthRouter);
router.use(fleetDriverApiRouter);
router.use(fleetPanelApiRouter);
router.use(insurerPanelApiRouter);
router.use(publicHomepageApiRouter);
router.use(panelApiRouter);
router.use(adminApiRouter);
router.use(customerApiRouter);
router.use(ridesRouter);

export default router;
