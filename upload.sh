#!/bin/bash

aws --profile tiuhti s3 cp index.html s3://tiuhti-web/tsirppu-dash/
aws --profile tiuhti s3 cp game.js s3://tiuhti-web/tsirppu-dash/
aws --profile tiuhti s3 cp High-Voltage_Club.mp3 s3://tiuhti-web/tsirppu-dash/High-Voltage_Club.mp3
aws --profile tiuhti s3 cp Relaxing_Techno.mp3 s3://tiuhti-web/tsirppu-dash/Relaxing_Techno.mp3
