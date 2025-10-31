# Activity Tracker

A modern, full-stack web application for tracking weekly activities with AI-powered insights. Built with Next.js, TypeScript, and Supabase.

## Overview

Activity Tracker is a personal productivity tool that helps users monitor their habits and routines with an intuitive weekly calendar interface. The app provides visual analytics, trend tracking, and AI-generated weekly summaries to keep users motivated and informed about their progress.

## Features

### 📊 **Interactive Weekly Calendar**
- Visual grid-based tracking for custom activities
- ISO week numbering for consistent time tracking

### 📈 **Data Visualization**
- Real-time trend charts showing activity patterns over time
- Weekly statistics (total activities, averages, active days)

### 🤖 **AI-Powered Insights**
- Weekly AI analysis powered by Google Gemini

### 🔐 **Secure Authentication & Data Storage**
- Email/password authentication via Supabase Auth
- End-to-end encrypted data transmission
- PostgreSQL database with Row Level Security (RLS)
- Multi-device synchronization

### 📱 **Responsive Design**
- Responsive layout powered with Tailwind CSS

## Tech Stack

- **Framework**: Next.js 15 with React 19
- **Language**: TypeScript
- **Authentication**: Supabase Auth
- **Database**: PostgreSQL (Supabase)
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS
- **Deployment**: Netlify
- **Development**: Turbopack for fast refresh

## Architecture

The application follows a modern, client-side architecture with:
- **State Management**: React hooks for local state
- **Data Persistence**: Supabase for cloud storage with automatic sync
- **Authentication**: Secure JWT-based sessions
- **API Integration**: Serverless functions for AI generation
