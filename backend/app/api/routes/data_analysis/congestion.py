from fastapi import APIRouter, Query
from sqlmodel import Session, select
from app.core.db import engine
from app.models import TaxiOrder
from fastapi.responses import JSONResponse
from typing import List, Dict
from datetime import datetime
import math
from sqlalchemy import text
import pandas as pd
import numpy as np

router = APIRouter(prefix="/analysis", tags=["analysis-congestion"])

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c / 1000  # 返回公里

@router.get("/road-congestion-status")
def road_congestion_status(
    start_utc: str = Query(..., description="起始时间戳，格式YYYYMMDDHHMMSS"),
    end_utc: str = Query(..., description="结束时间戳，格式YYYYMMDDHHMMSS"),
):
    """
    统计每条路段的平均通行速度（基于订单），SQL聚合加速
    """
    try:
        sql = text("""
            SELECT commaddr, utc, lat, lon
            FROM gpsrecord
            WHERE utc >= :start_utc AND utc <= :end_utc
            ORDER BY commaddr, utc
        """)
        with Session(engine) as session:
            rows = session.execute(sql, {"start_utc": start_utc, "end_utc": end_utc}).fetchall()
            records = [
                {"commaddr": row.commaddr, "utc": row.utc, "lat": float(row.lat), "lon": float(row.lon)}
                for row in rows
            ]

        import pandas as pd
        import numpy as np
        import math

        def flat_distance_np(lat1, lon1, lat2, lon2):
            return np.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) * 111000

        def parse_utc_np(utc_series):
            return pd.to_datetime(utc_series, format="%Y%m%d%H%M%S")

        df = pd.DataFrame(records)
        if df.empty or len(df) < 2:
            return {"roads": []}
        df["lat"] = df["lat"].astype(float)
        df["lon"] = df["lon"].astype(float)
        df["prev_lat"] = df.groupby("commaddr")["lat"].shift(1)
        df["prev_lon"] = df.groupby("commaddr")["lon"].shift(1)
        df["prev_utc"] = df.groupby("commaddr")["utc"].shift(1)
        df = df.dropna(subset=["prev_lat", "prev_lon", "prev_utc"])
        df["seconds"] = (parse_utc_np(df["utc"]) - parse_utc_np(df["prev_utc"])).dt.total_seconds()
        df = df[df["seconds"] > 0]
        df["distance"] = flat_distance_np(df["lat"], df["lon"], df["prev_lat"], df["prev_lon"])
        df["speed"] = df["distance"] / df["seconds"] * 100
        df["onlat"] = df["prev_lat"].round(1)
        df["onlon"] = df["prev_lon"].round(1)
        df["offlat"] = df["lat"].round(1)
        df["offlon"] = df["lon"].round(1)
        grouped = df.groupby(["onlat", "onlon", "offlat", "offlon"])
        result_df = grouped.agg(
            avg_speed=("speed", "mean"),
            count=("speed", "count")
        ).reset_index()
        def get_level(avg_speed):
            if avg_speed >= 4000:
                return "畅通"
            elif avg_speed >= 2000:
                return "一般"
            else:
                return "拥堵"
        result_df["congestion_level"] = result_df["avg_speed"].apply(get_level)
        roads = result_df.apply(lambda row: {
            "onlat": row.onlat,
            "onlon": row.onlon,
            "offlat": row.offlat,
            "offlon": row.offlon,
            "avg_speed": round(row.avg_speed, 1),
            "congestion_level": row.congestion_level,
            "count": int(row["count"])
        }, axis=1).tolist()
        return {"roads": roads}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"拥堵分析失败: {str(e)}"}) 