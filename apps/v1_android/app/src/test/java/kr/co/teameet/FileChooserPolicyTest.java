package kr.co.teameet;

import static org.junit.Assert.assertEquals;
import java.util.List;
import org.junit.Test;

public final class FileChooserPolicyTest {
    @Test public void normalizesAndDeduplicatesMimeTypes() {
        assertEquals(
            List.of("image/jpeg", "image/png"),
            FileChooserPolicy.acceptedMimeTypes(
                new String[] {" image/JPEG, .png ", "IMAGE/JPEG"}
            )
        );
    }

    @Test public void includesEverySupportedChatDocumentType() {
        List<String> types = FileChooserPolicy.acceptedMimeTypes(new String[] {
            ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.txt,.csv,.zip"
        });
        assertEquals(List.of(
            "application/pdf", "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/x-hwp", "application/hwp+zip", "text/plain", "text/csv", "application/zip"
        ), types);
        assertEquals("*/*", FileChooserPolicy.primaryMimeType(types));
    }

    @Test public void textFilesRemainSelectableAlongsidePdf() {
        assertEquals(List.of("application/pdf", "text/plain"),
            FileChooserPolicy.acceptedMimeTypes(new String[] {".pdf,.TXT"}));
    }

    @Test public void fallsBackWhenThePageDoesNotDeclareAValidMimeType() {
        assertEquals(List.of("*/*"), FileChooserPolicy.acceptedMimeTypes(new String[] {""}));
        assertEquals(List.of("*/*"), FileChooserPolicy.acceptedMimeTypes(null));
    }

    @Test public void choosesTheNarrowestSystemPickerType() {
        assertEquals("image/jpeg", FileChooserPolicy.primaryMimeType(List.of("image/jpeg")));
        assertEquals(
            "image/*",
            FileChooserPolicy.primaryMimeType(List.of("image/jpeg", "image/png"))
        );
        assertEquals(
            "*/*",
            FileChooserPolicy.primaryMimeType(List.of("image/jpeg", "application/pdf"))
        );
    }
}