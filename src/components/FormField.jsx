import React from 'react'

export default function FormField({ title, helper, children, className = '' }) {
  return (
    <div className={`form-control ${className}`}>
      {title ? <span className="block text-sm font-medium mb-1">{title}</span> : null}
      {children}
      {helper ? <p className="text-xs text-base-content/60 mt-1">{helper}</p> : null}
    </div>
  )
}


