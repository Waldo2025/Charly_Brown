Attribute VB_Name = "Module1"
Sub ReemplazarEstilosPorNombre_MacCompatible()
    Dim estilosUsados As Collection
    Set estilosUsados = New Collection
    
    Dim nombresUnicos As String
    nombresUnicos = "|"

    Dim para As Paragraph
    Dim nombre As String
    
    ' Detectar estilos de p‡rrafo
    For Each para In ActiveDocument.Paragraphs
        nombre = para.Range.Style.NameLocal
        If InStr(nombresUnicos, "|" & nombre & "|") = 0 Then
            estilosUsados.Add nombre
            nombresUnicos = nombresUnicos & nombre & "|"
        End If
    Next para

    ' Reemplazar cada estilo encontrado
    Dim nuevoNombre As String
    Dim i As Long
    Dim nuevoEstilo As Style
    Dim estiloExiste As Boolean

    For i = 1 To estilosUsados.Count
        nombre = estilosUsados(i)
        nuevoNombre = InputBox("Sustituir estilo '" & nombre & "' por:", "Renombrar estilo", nombre)
        
        estiloExiste = False
        For Each nuevoEstilo In ActiveDocument.Styles
            If nuevoEstilo.NameLocal = nuevoNombre And nuevoEstilo.Type = wdStyleTypeParagraph Then
                estiloExiste = True
                Exit For
            End If
        Next nuevoEstilo

        If estiloExiste Then
            For Each para In ActiveDocument.Paragraphs
                If para.Range.Style.NameLocal = nombre Then
                    para.Range.Style = nuevoNombre
                End If
            Next para
        Else
            MsgBox "? El estilo '" & nuevoNombre & "' no existe como estilo de p‡rrafo.", vbExclamation
        End If
    Next i

    MsgBox "? Estilos de p‡rrafo sustituidos con Žxito.", vbInformation
End Sub

